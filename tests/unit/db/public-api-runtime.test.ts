import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { authenticatePublicApiKey } from "@/lib/public-api/api-key-authentication";
import { generateApiKey } from "@/lib/public-api/api-key-crypto";
import {
  executeIdempotentMutation
} from "@/lib/public-api/idempotency";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "");
const pepper = `db-public-api-pepper-${suffix}`;
const masterKey = Buffer.alloc(32, 11).toString("base64");
const originalPepper = process.env.API_KEY_PEPPER;
const originalMasterKey = process.env.SECRETS_MASTER_KEY;

let orgId: string;
let credentialId: string;
let rawToken: string;

describe.runIf(run)("public API runtime database boundary", () => {
  beforeAll(async () => {
    process.env.API_KEY_PEPPER = pepper;
    process.env.SECRETS_MASTER_KEY = masterKey;
    const org = await prisma.organization.create({
      data: { name: "Public API DB proof", slug: `public-api-db-${suffix}` }
    });
    orgId = org.id;
    const generated = generateApiKey(pepper);
    rawToken = generated.token;
    const credential = await prisma.apiCredential.create({
      data: {
        orgId,
        name: "Runtime proof",
        prefix: generated.prefix,
        secretHash: generated.secretHash,
        scopes: ["contacts:read", "contacts:write"],
        rateLimitPerMinute: 2
      }
    });
    credentialId = credential.id;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.apiIdempotencyRecord.deleteMany({ where: { orgId } });
      await prisma.integrationAuditEvent.deleteMany({ where: { orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    restoreEnvironment("API_KEY_PEPPER", originalPepper);
    restoreEnvironment("SECRETS_MASTER_KEY", originalMasterKey);
  });

  it("resolves exact key evidence, consumes one shared PostgreSQL bucket, and never uses cookies", async () => {
    const request = () => new Request("https://api.example.test/api/v1/contacts", {
      headers: {
        authorization: `Bearer ${rawToken}`,
        cookie: "signalstack_session=must-be-ignored",
        "x-real-ip": "203.0.113.40"
      }
    });
    const first = await authenticatePublicApiKey(request(), ["contacts:read"]);
    const second = await authenticatePublicApiKey(request(), ["contacts:read"]);
    const limited = await authenticatePublicApiKey(request(), ["contacts:read"]);

    expect(first).toMatchObject({ ok: true, principal: { orgId, credentialId }, headers: { "RateLimit-Remaining": "1" } });
    expect(second).toMatchObject({ ok: true, headers: { "RateLimit-Remaining": "0" } });
    if (second.ok) expect(second.headers).not.toHaveProperty("Retry-After");
    expect(limited).toMatchObject({
      ok: false,
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      headers: { "RateLimit-Remaining": "0", "Retry-After": expect.any(String) }
    });

    const stored = await prisma.apiCredential.findUniqueOrThrow({ where: { id: credentialId } });
    expect(stored.lastUsedAt).not.toBeNull();
    expect(stored.lastUsedIpHash).not.toContain("203.0.113.40");
    expect(stored.rateRequestCount).toBe(2);
  });

  it("returns the same generic invalid-key denial after revocation", async () => {
    await prisma.apiCredential.update({ where: { id: credentialId }, data: { revokedAt: new Date() } });
    const result = await authenticatePublicApiKey(
      new Request("https://api.example.test/api/v1/contacts", {
        headers: { authorization: `Bearer ${rawToken}` }
      }),
      ["contacts:read"]
    );
    expect(result).toMatchObject({ ok: false, status: 401, code: "INVALID_API_KEY" });
    await prisma.apiCredential.update({
      where: { id: credentialId },
      data: { revokedAt: null, rateWindowStartedAt: null, rateRequestCount: 0 }
    });
  });

  it("serializes concurrent requests into one authoritative per-key window", async () => {
    await prisma.apiCredential.update({
      where: { id: credentialId },
      data: { rateLimitPerMinute: 3, rateWindowStartedAt: null, rateRequestCount: 0 }
    });
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        authenticatePublicApiKey(
          new Request("https://api.example.test/api/v1/contacts", {
            headers: { authorization: `Bearer ${rawToken}` }
          }),
          ["contacts:read"]
        )
      )
    );
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(results.filter((result) => !result.ok && result.code === "RATE_LIMIT_EXCEEDED")).toHaveLength(9);
    await expect(prisma.apiCredential.findUniqueOrThrow({ where: { id: credentialId } }))
      .resolves.toMatchObject({ rateRequestCount: 3 });
  });

  it("serializes concurrent duplicate writes once and encrypts the exact replay envelope", async () => {
    const idempotencyKey = `contact-create:${suffix}`;
    const runMutation = () => withTenantTransaction({ orgId }, (tx) =>
      executeIdempotentMutation(
        tx,
        {
          orgId,
          credentialId,
          idempotencyKey,
          method: "POST",
          canonicalRoute: "/api/v1/contacts",
          requestBody: { phone: "+15551234567" }
        },
        async () => {
          const tag = await tx.tag.create({
            data: { orgId, name: `idempotency-proof-${suffix}` }
          });
          return {
            status: 201,
            body: { ok: true, data: { id: tag.id, oneTimeValue: `secret-${suffix}` }, meta: { requestId: suffix } }
          };
        }
      )
    );

    const results = await Promise.all([runMutation(), runMutation()]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0].status).toBe(201);
    expect(results[0].body).toEqual(results[1].body);
    expect(await prisma.tag.count({ where: { orgId, name: `idempotency-proof-${suffix}` } })).toBe(1);

    const record = await prisma.apiIdempotencyRecord.findFirstOrThrow({ where: { orgId, credentialId } });
    expect(JSON.stringify(record.responseBody)).not.toContain(`secret-${suffix}`);
    expect(record.key).not.toContain(idempotencyKey);
  });

  it("rejects a same-key request binding change without a second mutation", async () => {
    await expect(
      withTenantTransaction({ orgId }, (tx) =>
        executeIdempotentMutation(
          tx,
          {
            orgId,
            credentialId,
            idempotencyKey: `contact-create:${suffix}`,
            method: "POST",
            canonicalRoute: "/api/v1/contacts",
            requestBody: { phone: "+15557654321" }
          },
          async () => ({ status: 201, body: { shouldNotRun: true } })
        )
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
