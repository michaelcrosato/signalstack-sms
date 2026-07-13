import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { verifyProviderAccount } from "@/lib/integrations/provider-accounts/service";
import {
  noStoreResponse,
  providerJson,
  providerRouteError,
  routeParam
} from "../../_shared";

type AccountRouteContext = Readonly<{ params: Promise<{ accountId: string }> }>;

export async function POST(request: Request, context: AccountRouteContext) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);
  const { accountId } = await context.params;

  try {
    const account = await verifyProviderAccount({
      orgId: currentOrg.orgId,
      providerAccountId: routeParam(accountId),
      actor: { userId: currentOrg.userId }
    });
    return providerJson({ account });
  } catch (error) {
    return providerRouteError(error);
  }
}
