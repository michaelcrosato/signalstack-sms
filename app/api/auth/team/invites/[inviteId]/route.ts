import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import { revokeTeamInvite } from "@/lib/auth/team-service";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import {
  invalidTeamRequestOriginResponse,
  noStoreJson,
  teamManagementUnavailableResponse,
  teamServiceErrorResponse,
  withTeamNoStore
} from "@/app/api/auth/team/route-support";

type InviteRouteContext = Readonly<{
  params: Promise<Readonly<{ inviteId: string }>>;
}>;

export async function DELETE(request: Request, context: InviteRouteContext) {
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

    const { inviteId } = await context.params;
    const revocation = await revokeTeamInvite(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      inviteId
    );
    return noStoreJson({ revocation }, 200);
  } catch (error) {
    return teamServiceErrorResponse(error);
  }
}
