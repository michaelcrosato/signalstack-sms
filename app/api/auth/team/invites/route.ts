import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import { createTeamInvite } from "@/lib/auth/team-service";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import {
  invalidTeamRequestOriginResponse,
  noStoreJson,
  teamManagementUnavailableResponse,
  teamServiceErrorResponse,
  withTeamNoStore
} from "@/app/api/auth/team/route-support";

export async function POST(request: Request) {
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
    const created = await createTeamInvite(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      rawPayload
    );
    return noStoreJson(
      {
        invite: created.invite,
        acceptPath: `/invite#token=${encodeURIComponent(created.token)}`
      },
      201
    );
  } catch (error) {
    return teamServiceErrorResponse(error);
  }
}
