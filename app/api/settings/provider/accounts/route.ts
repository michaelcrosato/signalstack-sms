import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import {
  connectProviderAccount,
  listProviderAccounts
} from "@/lib/integrations/provider-accounts/service";
import { providerAccountConnectSchema } from "@/lib/validation/provider";
import {
  noStoreResponse,
  parseProviderJson,
  providerJson,
  providerRouteError
} from "./_shared";

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);

  try {
    const accounts = await listProviderAccounts(currentOrg.orgId);
    return providerJson({ accounts });
  } catch (error) {
    return providerRouteError(error);
  }
}

export async function POST(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);

  const parsed = await parseProviderJson(request, providerAccountConnectSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const account = await connectProviderAccount({
      orgId: currentOrg.orgId,
      externalAccountId: parsed.data.externalAccountId,
      authToken: parsed.data.authToken,
      isDefault: parsed.data.isDefault,
      actor: { userId: currentOrg.userId }
    });
    return providerJson({ account }, 201);
  } catch (error) {
    return providerRouteError(error);
  }
}
