import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentOrgAuthError } from "@/lib/auth/current-org";
import { requireProtectedPage } from "@/lib/auth/page-authentication";

const mocks = vi.hoisted(() => ({
  getCurrentOrg: vi.fn(),
  credentialCount: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  })
}));

vi.mock("@/lib/auth/current-org", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/current-org")>();
  return {
    ...actual,
    getOrCreateCurrentOrg: mocks.getCurrentOrg
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: { localCredential: { count: mocks.credentialCount } }
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("protected page authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the verified current organization without querying setup state", async () => {
    const currentOrg = { orgId: "org-1", userId: "user-1", role: "OWNER" };
    mocks.getCurrentOrg.mockResolvedValue(currentOrg);

    await expect(requireProtectedPage("/dashboard")).resolves.toBe(currentOrg);
    expect(mocks.credentialCount).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends an uninitialized local installation to first-run setup", async () => {
    mocks.getCurrentOrg.mockRejectedValue(new CurrentOrgAuthError("AUTH_REQUIRED"));
    mocks.credentialCount.mockResolvedValue(0);

    await expect(requireProtectedPage("/dashboard")).rejects.toThrow("redirect:/setup");
    expect(mocks.redirect).toHaveBeenCalledWith("/setup");
  });

  it("sends an initialized installation to login with a local encoded return path", async () => {
    mocks.getCurrentOrg.mockRejectedValue(new CurrentOrgAuthError("AUTH_REQUIRED"));
    mocks.credentialCount.mockResolvedValue(1);

    await expect(requireProtectedPage("/settings")).rejects.toThrow(
      "redirect:/login?redirectTo=%2Fsettings"
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login?redirectTo=%2Fsettings");
  });

  it("does not reflect an unsafe return path and does not hide provider failures", async () => {
    mocks.getCurrentOrg.mockRejectedValueOnce(new CurrentOrgAuthError("AUTH_REQUIRED"));
    mocks.credentialCount.mockResolvedValueOnce(1);
    await expect(requireProtectedPage("//attacker.example")).rejects.toThrow(
      "redirect:/login?redirectTo=%2Fdashboard"
    );

    const unavailable = new CurrentOrgAuthError("AUTH_PROVIDER_UNAVAILABLE");
    mocks.getCurrentOrg.mockRejectedValueOnce(unavailable);
    await expect(requireProtectedPage("/dashboard")).rejects.toBe(unavailable);
  });
});
