import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import {
  getProviderAccount,
  revokeProviderAccount,
  setDefaultProviderAccount
} from "@/lib/integrations/provider-accounts/service";
import { providerAccountUpdateSchema } from "@/lib/validation/provider";
import {
  noStoreResponse,
  parseProviderJson,
  providerJson,
  providerRouteError,
  routeParam
} from "../_shared";

type AccountRouteContext = Readonly<{ params: Promise<{ accountId: string }> }>;

export async function GET(_request: Request, context: AccountRouteContext) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);
  const { accountId } = await context.params;

  try {
    const account = await getProviderAccount(
      currentOrg.orgId,
      routeParam(accountId)
    );
    return providerJson({ account });
  } catch (error) {
    return providerRouteError(error);
  }
}

export async function PATCH(request: Request, context: AccountRouteContext) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);

  const parsed = await parseProviderJson(request, providerAccountUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { accountId } = await context.params;

  try {
    const account = await setDefaultProviderAccount({
      orgId: currentOrg.orgId,
      providerAccountId: routeParam(accountId),
      actor: { userId: currentOrg.userId }
    });
    return providerJson({ account });
  } catch (error) {
    return providerRouteError(error);
  }
}

export async function DELETE(request: Request, context: AccountRouteContext) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);
  const { accountId } = await context.params;

  try {
    const account = await revokeProviderAccount({
      orgId: currentOrg.orgId,
      providerAccountId: routeParam(accountId),
      actor: { userId: currentOrg.userId }
    });
    return providerJson({ account });
  } catch (error) {
    return providerRouteError(error);
  }
}
