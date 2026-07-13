import {
  getCustomerWebhookEndpoint,
  updateCustomerWebhookEndpoint
} from "@/lib/integrations/customer-webhooks/service";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import {
  assertPublicApiRequestHasNoBody,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import {
  customerWebhookEndpointUpdateSchema,
  customerWebhookIdentifierSchema
} from "@/lib/validation/customer-webhooks";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = { params: Promise<{ endpointId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["webhooks:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const endpointId = customerWebhookIdentifierSchema.parse((await context.params).endpointId);
    const endpoint = await getCustomerWebhookEndpoint(authorization.principal.orgId, endpointId);
    if (!endpoint) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }
    return createPublicApiSuccessResponse(
      { endpoint },
      { requestId: authorization.requestId, headers: authorization.responseHeaders }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return mutateEndpoint(request, context, false);
}

export async function DELETE(request: Request, context: RouteContext) {
  return mutateEndpoint(request, context, true);
}

async function mutateEndpoint(request: Request, context: RouteContext, disable: boolean) {
  const authorization = await authorizePublicApiRequest(request, ["webhooks:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const endpointId = customerWebhookIdentifierSchema.parse((await context.params).endpointId);
    let requestBody: unknown = {};
    if (disable) {
      await assertPublicApiRequestHasNoBody(request);
    } else {
      requestBody = await readPublicApiJson(request);
    }
    const payload = disable
      ? { enabled: false as const }
      : customerWebhookEndpointUpdateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      `/api/v1/webhook-endpoints/${endpointId}`,
      requestBody,
      async (tx) => {
        const endpoint = await updateCustomerWebhookEndpoint(
          {
            orgId: authorization.principal.orgId,
            endpointId,
            ...payload,
            actor: { kind: "api_credential", credentialId: authorization.principal.credentialId }
          },
          tx
        );
        return publicApiSuccessSnapshot(
          toPublicApiJson({ endpoint }),
          authorization.requestId,
          200
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
