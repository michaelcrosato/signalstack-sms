import type { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import type { CurrentOrg } from "@/lib/auth/current-org";
import { getRoleAuthorizationError } from "@/lib/auth/roles";

export function requireApiRole(currentOrg: CurrentOrg, requiredRole: MembershipRole) {
  const roleError = getRoleAuthorizationError(currentOrg.role, requiredRole);

  if (!roleError) {
    return null;
  }

  return NextResponse.json(roleError, { status: 403 });
}
