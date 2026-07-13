import { rotateCustomerWebhookSigningSecret } from "@/lib/integrations/customer-webhooks/service";
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
type RouteContext = { params: Promise<{ endpointId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["webhooks:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    const endpointId = customerWebhookIdentifierSchema.parse((await context.params).endpointId);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      `/api/v1/webhook-endpoints/${endpointId}/rotate-secret`,
      {},
      async (tx) => {
        const revealed = await rotateCustomerWebhookSigningSecret(
          {
            orgId: authorization.principal.orgId,
            endpointId,
            actor: { kind: "api_credential", credentialId: authorization.principal.credentialId }
          },
          tx
        );
        return publicApiSuccessSnapshot(toPublicApiJson(revealed), authorization.requestId, 200);
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
