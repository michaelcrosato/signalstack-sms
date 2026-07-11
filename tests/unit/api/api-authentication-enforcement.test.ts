import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipRole } from "@prisma/client";
import { POST } from "@/app/api/contacts/route";

const mocks = vi.hoisted(() => ({
  evaluatePhoneNumberLookup: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  requireApiRole: vi.fn(),
  upsertContact: vi.fn(),
  withOptionalTenantRls: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/db/repositories/contacts", () => ({
  listContacts: vi.fn(),
  upsertContact: mocks.upsertContact
}));

vi.mock("@/lib/db/rls", () => ({
  withOptionalTenantRls: mocks.withOptionalTenantRls
}));

vi.mock("@/lib/validation/lookup", () => ({
  evaluatePhoneNumberLookup: mocks.evaluatePhoneNumberLookup,
  liveLookupOperatorHeaderName: "x-live-lookup-token"
}));

describe("mutating API authentication enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for a missing local session before body parsing, role checks, or mutation", async () => {
    const missingSessionError = Object.assign(new Error("raw session detail"), {
      name: "CurrentOrgAuthError",
      code: "AUTH_REQUIRED"
    });
    mocks.getOrCreateCurrentOrg.mockRejectedValue(missingSessionError);

    const request = new Request("http://localhost/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+15555550100" })
    });
    const bodyReader = vi.spyOn(request, "json");

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
      code: "AUTH_REQUIRED"
    });
    expect(bodyReader).not.toHaveBeenCalled();
    expect(mocks.requireApiRole).not.toHaveBeenCalled();
    expect(mocks.evaluatePhoneNumberLookup).not.toHaveBeenCalled();
    expect(mocks.withOptionalTenantRls).not.toHaveBeenCalled();
    expect(mocks.upsertContact).not.toHaveBeenCalled();
  });

  it("rejects a same-site sibling origin before body parsing, role checks, or mutation", async () => {
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "org-1",
      orgSlug: "org-one",
      orgName: "Org One",
      userId: "user-1",
      email: "owner@app.example.test",
      role: MembershipRole.OWNER,
      demoMode: false
    });
    const request = new Request("http://app.localhost/api/contacts", {
      method: "POST",
      headers: {
        Origin: "http://evil.localhost",
        Host: "app.localhost",
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({ phone: "+15555550100" })
    });
    const bodyReader = vi.spyOn(request, "json");

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request origin.",
      code: "INVALID_REQUEST_ORIGIN"
    });
    expect(bodyReader).not.toHaveBeenCalled();
    expect(mocks.requireApiRole).not.toHaveBeenCalled();
    expect(mocks.evaluatePhoneNumberLookup).not.toHaveBeenCalled();
    expect(mocks.withOptionalTenantRls).not.toHaveBeenCalled();
    expect(mocks.upsertContact).not.toHaveBeenCalled();
  });
});
