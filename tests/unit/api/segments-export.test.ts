import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/contacts/segments/export/route";
import { NextRequest } from "next/server";

// Mock auth
import * as auth from "@/lib/auth/current-org";
import { vi } from "vitest";

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: vi.fn().mockResolvedValue({ orgId: "test-org" })
}));

vi.mock("@/lib/db/rls", () => ({
  withOptionalTenantRls: vi.fn().mockImplementation((orgId, cb) => cb({}))
}));

vi.mock("@/lib/db/repositories/segments", () => ({
  evaluateSegmentContacts: vi.fn().mockResolvedValue([
    {
      phone: "+1234567890",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      displayName: "Test User",
      consentStatus: "OPTED_IN",
      leadScore: 50,
      tagLinks: [{ tag: { name: "VIP" } }],
      listLinks: []
    }
  ])
}));

describe("Segments Export API", () => {
  it("rejects invalid filter JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/contacts/segments/export?filter={invalid}");
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid JSON in filter parameter.");
  });

  it("rejects valid JSON with wrong schema", async () => {
    const req = new NextRequest("http://localhost:3000/api/contacts/segments/export?filter={\"tagNames\":\"not-an-array\"}");
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid filter format.");
  });

  it("accepts valid JSON with correct schema", async () => {
    const req = new NextRequest("http://localhost:3000/api/contacts/segments/export?filter={\"tagNames\":[\"VIP\"]}");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const content = await res.text();
    expect(content).toContain("test@example.com");
  });
});
