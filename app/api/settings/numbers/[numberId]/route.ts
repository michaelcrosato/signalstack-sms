import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { updateProviderPhoneNumberLifecycle } from "@/lib/integrations/provider-accounts/service";
import { providerResourceLifecycleSchema } from "@/lib/validation/provider";
import {
  noStoreResponse,
  parseProviderJson,
  providerJson,
  providerRouteError,
  routeParam
} from "../../provider/accounts/_shared";

type NumberRouteContext = Readonly<{ params: Promise<{ numberId: string }> }>;

export async function PATCH(request: Request, context: NumberRouteContext) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) return authentication.response;
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return noStoreResponse(roleResponse);

  const parsed = await parseProviderJson(request, providerResourceLifecycleSchema);
  if (!parsed.ok) return parsed.response;
  const { numberId } = await context.params;

  try {
    const number = await updateProviderPhoneNumberLifecycle({
      orgId: currentOrg.orgId,
      phoneNumberId: routeParam(numberId),
      ...parsed.data,
      actor: { userId: currentOrg.userId }
    });
    return providerJson({ number });
  } catch (error) {
    return providerRouteError(error);
  }
}
