import { describe, expect, it, vi } from "vitest";
import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import {
  clerkConfigIsPresent,
  productionAuthIsEnabled,
  resolveProductionCurrentOrg,
  type MembershipResolver
} from "@/lib/auth/session";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "mock_clerk_id", orgId: "mock_clerk_org" })
}));

import { auth } from "@clerk/nextjs/server";

const activeMember: MembershipResolver = async () => ({
  orgId: "org_live",
  orgSlug: "live-org",
  orgName: "Live Org",
  demoMode: false,
  userId: "user_live",
  email: "member@live.example",
  role: MembershipRole.MEMBER
});

describe("productionAuthIsEnabled / clerkConfigIsPresent", () => {
  it("is demo-by-default (flag off)", () => {
    expect(productionAuthIsEnabled({})).toBe(false);
    expect(productionAuthIsEnabled({ PRODUCTION_AUTH_ENABLED: "false" })).toBe(false);
    expect(productionAuthIsEnabled({ PRODUCTION_AUTH_ENABLED: "true" })).toBe(true);
  });

  it("detects Clerk config only when both keys are present", () => {
    expect(clerkConfigIsPresent({})).toBe(false);
    expect(clerkConfigIsPresent({ CLERK_SECRET_KEY: "x" })).toBe(false);
    expect(clerkConfigIsPresent({ CLERK_SECRET_KEY: "x", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "y" })).toBe(true);
  });
});

describe("resolveProductionCurrentOrg (fail-closed)", () => {
  it("returns null for an unauthenticated request (no subject explicitly passed)", async () => {
    await expect(resolveProductionCurrentOrg(null, activeMember)).resolves.toBeNull();
  });

  it("extracts subject from clerk auth() if subject is not provided", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: "user_implicit", orgId: "org_implicit" } as unknown as Awaited<ReturnType<typeof auth>>);
    const resolverSpy = vi.fn().mockResolvedValue(await activeMember({ clerkUserId: "dummy" }));

    const result = await resolveProductionCurrentOrg(undefined, resolverSpy);
    expect(resolverSpy).toHaveBeenCalledWith({ clerkUserId: "user_implicit", clerkOrgId: "org_implicit" });
    expect(result?.orgId).toBe("org_live");
  });

  it("returns null if auth() throws", async () => {
    vi.mocked(auth).mockRejectedValueOnce(new Error("Auth Error"));
    await expect(resolveProductionCurrentOrg(undefined, activeMember)).resolves.toBeNull();
  });

  it("returns null if auth() returns no userId", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null, orgId: null } as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(resolveProductionCurrentOrg(undefined, activeMember)).resolves.toBeNull();
  });

  it("returns null when the subject has no active membership", async () => {
    const noMembership: MembershipResolver = async () => null;
    await expect(resolveProductionCurrentOrg({ clerkUserId: "u" }, noMembership)).resolves.toBeNull();
  });

  it("derives org and role from the active membership, not a constant", async () => {
    const currentOrg = await resolveProductionCurrentOrg({ clerkUserId: "u" }, activeMember);
    expect(currentOrg).toMatchObject({ orgId: "org_live", role: MembershipRole.MEMBER, demoMode: false });
  });

  it("feeds requireApiRole so an under-privileged membership is denied", async () => {
    const currentOrg = await resolveProductionCurrentOrg({ clerkUserId: "u" }, activeMember);
    expect(currentOrg).not.toBeNull();
    expect(requireApiRole(currentOrg!, MembershipRole.ADMIN)?.status).toBe(403);
    expect(requireApiRole(currentOrg!, MembershipRole.MEMBER)).toBeNull();
  });
});
