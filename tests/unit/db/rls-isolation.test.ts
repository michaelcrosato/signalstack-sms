import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { withTenantRls, withOptionalTenantRls, rlsIsEnabled } from "@/lib/db/rls";

// Integration proof for SPEC-010. Hits a real Postgres with the RLS migration applied, so it is gated on
// RUN_DB_TESTS (the default `npm test` skips it — it never touches the DB). Run it with:
//   RUN_DB_TESTS=true DATABASE_URL=postgres://... npx vitest run tests/unit/db/rls-isolation.test.ts
const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("RLS tenant isolation (integration; requires Postgres + RUN_DB_TESTS=true)", () => {
  const suffix = Date.now().toString(36);
  let orgAId = "";
  let orgBId = "";

  beforeAll(async () => {
    const orgA = await prisma.organization.create({ data: { slug: `rls-a-${suffix}`, name: "RLS A", demoMode: true } });
    const orgB = await prisma.organization.create({ data: { slug: `rls-b-${suffix}`, name: "RLS B", demoMode: true } });
    orgAId = orgA.id;
    orgBId = orgB.id;
    await prisma.contact.create({ data: { orgId: orgAId, phone: `+1700${suffix}1` } });
    await prisma.contact.create({ data: { orgId: orgBId, phone: `+1700${suffix}2` } });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } });
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
});


describe("rlsIsEnabled (unit)", () => {
  it("returns true when DATABASE_RLS_ENFORCED is 'true'", () => {
    expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "true" })).toBe(true);
  });

  it("returns false when DATABASE_RLS_ENFORCED is 'false'", () => {
    expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "false" })).toBe(false);
  });

  it("returns false when DATABASE_RLS_ENFORCED is undefined", () => {
    expect(rlsIsEnabled({})).toBe(false);
  });

  it("returns false when DATABASE_RLS_ENFORCED is some other string", () => {
    expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "something_else" })).toBe(false);
  });
});

describe("withOptionalTenantRls (unit)", () => {
  it("executes wrapped queries on the global prisma instance if RLS is disabled", async () => {
    const mockFn = vi.fn().mockImplementation(() => Promise.resolve("done"));
    const result = await withOptionalTenantRls("org-123", mockFn, { DATABASE_RLS_ENFORCED: "false" });
    expect(result).toBe("done");
    expect(mockFn.mock.calls[0][0]).toBe(prisma);
  });
});
