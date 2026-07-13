import { describe, it, expect, vi } from "vitest";
import { GET } from "@/app/api/contacts/segments/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: vi.fn().mockResolvedValue({ orgId: "test-org" })
}));

vi.mock("@/lib/db/rls", () => ({
  withOptionalTenantRls: vi.fn().mockImplementation((orgId, cb) => cb({}))
}));

vi.mock("@/lib/db/repositories/segments", () => ({
  evaluateSegmentContacts: vi.fn().mockResolvedValue([
    { phone: "+1234567890", email: "test@example.com", displayName: "Test User" }
  ])
}));

describe("Segments evaluate API", () => {
  const url = "http://localhost:3000/api/contacts/segments";

  it("rejects invalid filter JSON with 400", async () => {
    const res = await GET(new NextRequest(`${url}?filter={invalid}`));
    expect(res.status).toBe(400);
  });

  it("rejects a JSON filter with the wrong schema with 400", async () => {
    const res = await GET(new NextRequest(`${url}?filter={"tagNames":"not-an-array"}`));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown consent status query param with 400, not 500", async () => {
    // Previously cast straight to ConsentStatus[] and reached Prisma as an invalid enum (500).
    const res = await GET(new NextRequest(`${url}?consentStatuses=BOGUS`));
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric lead score query param with 400, not 500", async () => {
    // Previously parseInt("abc") = NaN reached Prisma as { gte: NaN } (500).
    const res = await GET(new NextRequest(`${url}?minLeadScore=abc`));
    expect(res.status).toBe(400);
  });

  it("accepts valid query params and returns contacts", async () => {
    const res = await GET(
      new NextRequest(`${url}?consentStatuses=OPTED_IN&tagNames=VIP&minLeadScore=10`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contacts).toHaveLength(1);
  });

  it("accepts a valid JSON filter", async () => {
    const res = await GET(new NextRequest(`${url}?filter={"tagNames":["VIP"]}`));
    expect(res.status).toBe(200);
  });
});
