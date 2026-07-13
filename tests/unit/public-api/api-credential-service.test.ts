import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createApiCredential,
  revokeApiCredential,
  rotateApiCredential
} from "@/lib/public-api/api-credential-service";

const environment = { API_KEY_PEPPER: "p".repeat(64) };
const baseCredential = {
  id: "credential-a",
  orgId: "org-a",
  name: "Production integration",
  prefix: "ss_api_aaaaaaaaaaaa",
  secretHash: "old-hash",
  scopes: ["contacts:read", "contacts:write"],
  rateLimitPerMinute: 60,
  rateWindowStartedAt: null,
  rateRequestCount: 0,
  expiresAt: null,
  lastUsedAt: null,
  lastUsedIpHash: null,
  revokedAt: null,
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  updatedAt: new Date("2030-01-01T00:00:00.000Z")
};

describe("API credential lifecycle", () => {
  it("returns a new secret once while persisting only its digest and safe audit metadata", async () => {
    const writes: unknown[] = [];
    const tx = {
      apiCredential: {
        create: vi.fn(async ({ data }) => {
          writes.push(data);
          return { ...baseCredential, ...data };
        })
      },
      integrationAuditEvent: {
        create: vi.fn(async ({ data }) => {
          writes.push(data);
          return data;
        })
      }
    } as unknown as Prisma.TransactionClient;

    const result = await createApiCredential(
      {
        orgId: "org-a",
        name: " Production integration ",
        scopes: ["contacts:write", "contacts:read", "contacts:read"],
        actor: { kind: "user", userId: "user-a" }
      },
      tx,
      environment
    );

    expect(result.token).toMatch(/^ss_api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
    expect(result.credential).not.toHaveProperty("secretHash");
    expect(result.credential).not.toHaveProperty("token");
    expect(result.credential.scopes).toEqual(["contacts:read", "contacts:write"]);
    expect(JSON.stringify(writes)).not.toContain(result.token);
    expect(writes[0]).toMatchObject({ secretHash: expect.any(String), prefix: result.credential.prefix });
  });

  it("rotates in place, clearing use and rate metadata without changing scopes", async () => {
    const audit = vi.fn(async ({ data }) => data);
    const update = vi.fn(async ({ data }) => ({
      ...baseCredential,
      ...data,
      updatedAt: new Date("2030-01-02T00:00:00.000Z")
    }));
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: baseCredential.id }]),
      apiCredential: {
        findFirst: vi.fn(async () => baseCredential),
        update
      },
      integrationAuditEvent: { create: audit }
    } as unknown as Prisma.TransactionClient;

    const result = await rotateApiCredential(
      {
        orgId: "org-a",
        credentialId: "credential-a",
        actor: { kind: "api_credential", credentialId: "credential-a" }
      },
      tx,
      environment
    );

    expect(result.credential.id).toBe("credential-a");
    expect(result.credential.scopes).toEqual(["contacts:read", "contacts:write"]);
    expect(result.credential.prefix).not.toBe(baseCredential.prefix);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secretHash: expect.any(String),
          rateWindowStartedAt: null,
          rateRequestCount: 0,
          lastUsedAt: null
        })
      })
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain(result.token);
  });

  it("revokes idempotently and emits a single audit event", async () => {
    const audit = vi.fn(async ({ data }) => data);
    const update = vi.fn(async ({ data }) => ({ ...baseCredential, ...data }));
    const firstTx = {
      $queryRaw: vi.fn(async () => [{ id: baseCredential.id }]),
      apiCredential: { findFirst: vi.fn(async () => baseCredential), update },
      integrationAuditEvent: { create: audit }
    } as unknown as Prisma.TransactionClient;
    const first = await revokeApiCredential(
      { orgId: "org-a", credentialId: "credential-a", actor: { kind: "user", userId: "user-a" } },
      firstTx
    );
    expect(first.revokedAt).not.toBeNull();
    expect(audit).toHaveBeenCalledOnce();

    const revoked = { ...baseCredential, revokedAt: new Date("2030-01-01T00:00:00.000Z") };
    const secondTx = {
      $queryRaw: vi.fn(async () => [{ id: baseCredential.id }]),
      apiCredential: { findFirst: vi.fn(async () => revoked), update },
      integrationAuditEvent: { create: audit }
    } as unknown as Prisma.TransactionClient;
    await revokeApiCredential(
      { orgId: "org-a", credentialId: "credential-a", actor: { kind: "user", userId: "user-a" } },
      secondTx
    );
    expect(audit).toHaveBeenCalledOnce();
  });

  it("rejects a stale self-rotation prefix after a concurrent rotation wins", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: baseCredential.id }]),
      apiCredential: {
        findFirst: vi.fn(async () => ({ ...baseCredential, prefix: "ss_api_bbbbbbbbbbbb" })),
        update: vi.fn()
      },
      integrationAuditEvent: { create: vi.fn() }
    } as unknown as Prisma.TransactionClient;

    await expect(
      rotateApiCredential(
        {
          orgId: "org-a",
          credentialId: "credential-a",
          expectedPrefix: "ss_api_aaaaaaaaaaaa",
          actor: { kind: "api_credential", credentialId: "credential-a" }
        },
        tx,
        environment
      )
    ).rejects.toMatchObject({ code: "API_CREDENTIAL_ROTATION_CONFLICT" });
    expect(tx.apiCredential.update).not.toHaveBeenCalled();
  });
});
