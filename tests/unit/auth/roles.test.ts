import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertRoleAtLeast, hasRoleAtLeast } from "@/lib/auth/roles";

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
});

