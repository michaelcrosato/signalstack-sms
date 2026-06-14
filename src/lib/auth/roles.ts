import type { MembershipRole } from "@prisma/client";

const roleRank: Record<MembershipRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3
};

export function hasRoleAtLeast(actual: MembershipRole, required: MembershipRole) {
  return roleRank[actual] >= roleRank[required];
}

export function assertRoleAtLeast(actual: MembershipRole, required: MembershipRole) {
  if (!hasRoleAtLeast(actual, required)) {
    throw new Error(`Requires ${required} role or higher.`);
  }
}

export function getRoleAuthorizationError(actual: MembershipRole, required: MembershipRole) {
  if (hasRoleAtLeast(actual, required)) {
    return null;
  }

  return {
    error: `Requires ${required} role or higher.`,
    requiredRole: required,
    currentRole: actual
  };
}
