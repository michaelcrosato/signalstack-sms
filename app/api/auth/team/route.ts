import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { listTeam } from "@/lib/auth/team-service";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import {
  noStoreJson,
  teamManagementUnavailableResponse,
  teamServiceErrorResponse,
  withTeamNoStore
} from "@/app/api/auth/team/route-support";

export async function GET() {
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
    if (getRuntimeConfig().auth.mode !== "local") {
      return teamManagementUnavailableResponse();
    }
    const roster = await listTeam({
      userId: currentOrg.userId,
      orgId: currentOrg.orgId
    });
    return noStoreJson(roster, 200);
  } catch (error) {
    return teamServiceErrorResponse(error);
  }
}
