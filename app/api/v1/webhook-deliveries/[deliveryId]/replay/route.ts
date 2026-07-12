import { replayCustomerWebhookDelivery } from "@/lib/integrations/customer-webhooks/service";
import {
  assertPublicApiRequestHasNoBody,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
import { customerWebhookIdentifierSchema } from "@/lib/validation/customer-webhooks";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["POST"]);
export {
  methodNotAllowed as GET,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = { params: Promise<{ deliveryId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["webhooks:replay"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    const deliveryId = customerWebhookIdentifierSchema.parse((await context.params).deliveryId);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      `/api/v1/webhook-deliveries/${deliveryId}/replay`,
      {},
      async (tx) => {
        const delivery = await replayCustomerWebhookDelivery(
          {
            orgId: authorization.principal.orgId,
            deliveryId,
            actor: { kind: "api_credential", credentialId: authorization.principal.credentialId }
          },
          tx
        );
        return publicApiSuccessSnapshot(
          toPublicApiJson({ delivery }),
          authorization.requestId,
          201
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
