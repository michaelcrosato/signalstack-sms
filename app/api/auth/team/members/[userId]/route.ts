import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import {
  reactivateTeamMember,
  revokeTeamMember,
  suspendTeamMember,
  updateTeamMemberRole
} from "@/lib/auth/team-service";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import {
  teamMemberRoleUpdateSchema,
  teamMemberStatusUpdateSchema
} from "@/lib/validation/auth";
import {
  invalidTeamRequestOriginResponse,
  invalidTeamRequestResponse,
  noStoreJson,
  teamManagementUnavailableResponse,
  teamServiceErrorResponse,
  withTeamNoStore
} from "@/app/api/auth/team/route-support";

type MemberRouteContext = Readonly<{
  params: Promise<Readonly<{ userId: string }>>;
}>;

export async function PATCH(request: Request, context: MemberRouteContext) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return withTeamNoStore(authentication.response);
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return withTeamNoStore(roleResponse);
  }

  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return teamManagementUnavailableResponse();
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidTeamRequestOriginResponse();
    }

    const rawPayload = await request.json().catch(() => undefined);
    const roleInput = teamMemberRoleUpdateSchema.safeParse(rawPayload);
    const statusInput = teamMemberStatusUpdateSchema.safeParse(rawPayload);
    if (roleInput.success === statusInput.success) {
      return invalidTeamRequestResponse();
    }
    const { userId } = await context.params;
    const actor = { userId: currentOrg.userId, orgId: currentOrg.orgId };
    let member;
    if (roleInput.success) {
      member = await updateTeamMemberRole(actor, userId, roleInput.data);
    } else if (statusInput.success && statusInput.data.suspended) {
      member = await suspendTeamMember(actor, userId);
    } else if (statusInput.success) {
      member = await reactivateTeamMember(actor, userId);
    } else {
      return invalidTeamRequestResponse();
    }
    return noStoreJson({ member }, 200);
  } catch (error) {
    return teamServiceErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: MemberRouteContext) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return withTeamNoStore(authentication.response);
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return withTeamNoStore(roleResponse);
  }

  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return teamManagementUnavailableResponse();
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidTeamRequestOriginResponse();
    }

    const { userId } = await context.params;
    const revocation = await revokeTeamMember(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      userId
    );
    return noStoreJson({ revocation }, 200);
  } catch (error) {
    return teamServiceErrorResponse(error);
  }
}
