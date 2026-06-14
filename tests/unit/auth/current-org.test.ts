import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { verifyClerkToken } from "@/lib/auth/clerk-verifier";
import { resolveProductionCurrentOrg } from "@/lib/auth/session";

vi.mock("@/lib/auth/clerk-verifier", () => ({
  verifyClerkToken: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  productionAuthIsEnabled: vi.fn(() => true),
  resolveProductionCurrentOrg: vi.fn(),
}));

describe("getOrCreateCurrentOrg with production auth enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws an error if authorization header/cookie is missing", async () => {
    const request = new Request("https://example.com");
    await expect(getOrCreateCurrentOrg(request)).rejects.toThrow("Unauthorized: Missing token.");
  });

  it("extracts token from Bearer authorization header, verifies it, and resolves org", async () => {
    const request = new Request("https://example.com", {
      headers: {
        Authorization: "Bearer test-jwt-token",
      },
    });

    const mockSubject = { clerkUserId: "user_clerk", clerkOrgId: "org_clerk" };
    const mockCurrentOrg = {
      orgId: "org_local",
      orgSlug: "org-slug",
      orgName: "Test Org",
      userId: "user_local",
      email: "test@example.com",
      role: "ADMIN",
      demoMode: false,
    };

    vi.mocked(verifyClerkToken).mockResolvedValueOnce(mockSubject);
    vi.mocked(resolveProductionCurrentOrg).mockResolvedValueOnce(mockCurrentOrg as any);

    const result = await getOrCreateCurrentOrg(request);

    expect(verifyClerkToken).toHaveBeenCalledWith("test-jwt-token");
    expect(resolveProductionCurrentOrg).toHaveBeenCalledWith(mockSubject);
    expect(result).toEqual(mockCurrentOrg);
  });

  it("extracts token from cookie, verifies it, and resolves org", async () => {
    const request = new Request("https://example.com", {
      headers: {
        Cookie: "some-other-cookie=123; __session=test-cookie-token; another=abc",
      },
    });

    const mockSubject = { clerkUserId: "user_clerk", clerkOrgId: "org_clerk" };
    const mockCurrentOrg = {
      orgId: "org_local",
      orgSlug: "org-slug",
      orgName: "Test Org",
      userId: "user_local",
      email: "test@example.com",
      role: "ADMIN",
      demoMode: false,
    };

    vi.mocked(verifyClerkToken).mockResolvedValueOnce(mockSubject);
    vi.mocked(resolveProductionCurrentOrg).mockResolvedValueOnce(mockCurrentOrg as any);

    const result = await getOrCreateCurrentOrg(request);

    expect(verifyClerkToken).toHaveBeenCalledWith("test-cookie-token");
    expect(resolveProductionCurrentOrg).toHaveBeenCalledWith(mockSubject);
    expect(result).toEqual(mockCurrentOrg);
  });

  it("throws forbidden error if resolveProductionCurrentOrg returns null", async () => {
    const request = new Request("https://example.com", {
      headers: {
        Authorization: "Bearer test-jwt-token",
      },
    });

    vi.mocked(verifyClerkToken).mockResolvedValueOnce({ clerkUserId: "user_clerk", clerkOrgId: "org_clerk" });
    vi.mocked(resolveProductionCurrentOrg).mockResolvedValueOnce(null);

    await expect(getOrCreateCurrentOrg(request)).rejects.toThrow(
      "Forbidden: Inactive or missing membership."
    );
  });
});
