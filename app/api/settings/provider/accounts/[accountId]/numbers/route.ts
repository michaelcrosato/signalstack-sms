import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { listOwnedProviderPhoneNumbers } from "@/lib/integrations/provider-accounts/service";
import {
  noStoreResponse,
  providerJson,
  providerRouteError,
  routeParam
} from "../../_shared";

type AccountRouteContext = Readonly<{ params: Promise<{ accountId: string }> }>;

export async function GET(_request: Request, context: AccountRouteContext) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);
  const { accountId } = await context.params;

  try {
    const phoneNumbers = await listOwnedProviderPhoneNumbers(
      currentOrg.orgId,
      routeParam(accountId)
    );
    return providerJson({ phoneNumbers });
  } catch (error) {
    return providerRouteError(error);
  }
}
