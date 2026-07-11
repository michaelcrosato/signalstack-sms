import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { withTenantRls, withOptionalTenantRls } from "@/lib/db/rls";

// Integration proof for SPEC-010. Hits a real Postgres with the RLS migration applied, so it is gated on
// RUN_DB_TESTS (the default `npm test` skips it — it never touches the DB). Run it with:
//   RUN_DB_TESTS=true DATABASE_URL=postgres://... npx vitest run tests/unit/db/rls-isolation.test.ts
const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("RLS tenant isolation (integration; requires Postgres + RUN_DB_TESTS=true)", () => {
  const suffix = Date.now().toString(36);
  let orgAId = "";
  let orgBId = "";
  let authUserId = "";

  beforeAll(async () => {
    const orgA = await prisma.organization.create({ data: { slug: `rls-a-${suffix}`, name: "RLS A", demoMode: true } });
    const orgB = await prisma.organization.create({ data: { slug: `rls-b-${suffix}`, name: "RLS B", demoMode: true } });
    orgAId = orgA.id;
    orgBId = orgB.id;
    const authUser = await prisma.appUser.create({
      data: {
        email: `rls-auth-${suffix}@example.test`,
        normalizedEmail: `rls-auth-${suffix}@example.test`
      }
    });
    authUserId = authUser.id;
    await prisma.contact.create({ data: { orgId: orgAId, phone: `+1700${suffix}1` } });
    await prisma.contact.create({ data: { orgId: orgBId, phone: `+1700${suffix}2` } });
    await prisma.authSession.createMany({
      data: [
        {
          tokenHash: sessionHash("a", suffix),
          userId: authUserId,
          orgId: orgAId,
          authVersion: authUser.authVersion,
          idleExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          absoluteExpiresAt: new Date("2030-01-01T00:00:00.000Z")
        },
        {
          tokenHash: sessionHash("b", suffix),
          userId: authUserId,
          orgId: orgBId,
          authVersion: authUser.authVersion,
          idleExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          absoluteExpiresAt: new Date("2030-01-01T00:00:00.000Z")
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } });
    if (authUserId) {
      await prisma.appUser.deleteMany({ where: { id: authUserId } });
    }
  });

  it("returns only the active org's rows even when the app-level filter is omitted", async () => {
    const aRows = await withTenantRls(orgAId, (tx) => tx.contact.findMany({ select: { orgId: true } }));
    expect(aRows.length).toBeGreaterThan(0);
    expect(aRows.every((row) => row.orgId === orgAId)).toBe(true);
    expect(aRows.some((row) => row.orgId === orgBId)).toBe(false);

    const bRows = await withTenantRls(orgBId, (tx) => tx.contact.findMany({ select: { orgId: true } }));
    expect(bRows.every((row) => row.orgId === orgBId)).toBe(true);
    expect(bRows.some((row) => row.orgId === orgAId)).toBe(false);
  });

  it("blocks a cross-tenant insert at the DB via the WITH CHECK clause", async () => {
    await expect(
      withTenantRls(orgAId, (tx) => tx.contact.create({ data: { orgId: orgBId, phone: `+1700${suffix}3` } }))
    ).rejects.toThrow();
  });

  it("applies the tenant RLS boundary to opaque auth sessions", async () => {
    const aRows = await withTenantRls(orgAId, (tx) =>
      tx.authSession.findMany({ select: { orgId: true, tokenHash: true } })
    );
    expect(aRows).toEqual([{ orgId: orgAId, tokenHash: sessionHash("a", suffix) }]);

    const bRows = await withTenantRls(orgBId, (tx) =>
      tx.authSession.findMany({ select: { orgId: true, tokenHash: true } })
    );
    expect(bRows).toEqual([{ orgId: orgBId, tokenHash: sessionHash("b", suffix) }]);
  });
});

function sessionHash(label: string, suffix: string) {
  return createHash("sha256").update(`rls-session-${label}-${suffix}`, "utf8").digest("base64url");
}

describe("withOptionalTenantRls (unit)", () => {
  it("executes wrapped queries on the global prisma instance if RLS is disabled", async () => {
    const mockFn = vi.fn().mockImplementation(() => Promise.resolve("done"));
    const result = await withOptionalTenantRls("org-123", mockFn, { DATABASE_RLS_ENFORCED: "false" });
    expect(result).toBe("done");
    expect(mockFn.mock.calls[0][0]).toBe(prisma);
  });
});
