import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { requireApiRole } from "@/lib/auth/api-authorization";
import type { CurrentOrg } from "@/lib/auth/current-org";
import { assertRoleAtLeast, getRoleAuthorizationError, hasRoleAtLeast } from "@/lib/auth/roles";

describe("membership role checks", () => {
  it("allows higher roles to perform lower-role actions", () => {
    expect(hasRoleAtLeast(MembershipRole.OWNER, MembershipRole.MEMBER)).toBe(true);
    expect(hasRoleAtLeast(MembershipRole.ADMIN, MembershipRole.MEMBER)).toBe(true);
  });

  it("blocks lower roles from admin actions", () => {
    expect(hasRoleAtLeast(MembershipRole.MEMBER, MembershipRole.ADMIN)).toBe(false);
    expect(() => assertRoleAtLeast(MembershipRole.MEMBER, MembershipRole.ADMIN)).toThrow(
      "Requires ADMIN role or higher."
    );
  });

  it("returns structured authorization errors for API route boundaries", () => {
    expect(getRoleAuthorizationError(MembershipRole.OWNER, MembershipRole.ADMIN)).toBeNull();
    expect(getRoleAuthorizationError(MembershipRole.MEMBER, MembershipRole.ADMIN)).toEqual({
      error: "Requires ADMIN role or higher.",
      requiredRole: MembershipRole.ADMIN,
      currentRole: MembershipRole.MEMBER
    });
  });

  it("returns a 403 API response when the current role is below the required route scope", async () => {
    const response = requireApiRole(
      {
        orgId: "org_1",
        orgSlug: "demo",
        orgName: "Demo",
        userId: "user_1",
        email: "member@example.com",
        role: MembershipRole.MEMBER,
        demoMode: true
      } satisfies CurrentOrg,
      MembershipRole.ADMIN
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Requires ADMIN role or higher.",
      requiredRole: MembershipRole.ADMIN,
      currentRole: MembershipRole.MEMBER
    });
  });
});
