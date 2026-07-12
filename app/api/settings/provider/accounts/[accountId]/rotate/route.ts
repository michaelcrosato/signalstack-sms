import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { rotateProviderAccountCredential } from "@/lib/integrations/provider-accounts/service";
import { providerCredentialRotateSchema } from "@/lib/validation/provider";
import {
  noStoreResponse,
  parseProviderJson,
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

  const parsed = await parseProviderJson(request, providerCredentialRotateSchema);
  if (!parsed.ok) return parsed.response;
  const { accountId } = await context.params;

  try {
    const account = await rotateProviderAccountCredential({
      orgId: currentOrg.orgId,
      providerAccountId: routeParam(accountId),
      authToken: parsed.data.authToken,
      actor: { userId: currentOrg.userId }
    });
    return providerJson({ account });
  } catch (error) {
    return providerRouteError(error);
  }
}
