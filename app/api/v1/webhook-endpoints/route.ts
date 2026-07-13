import {
  createCustomerWebhookEndpoint,
  listCustomerWebhookEndpoints,
  validateCustomerWebhookEndpointDestination
} from "@/lib/integrations/customer-webhooks/service";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import {
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import {
  createPublicApiPage,
  parsePublicApiCollectionQuery
} from "@/lib/public-api/resource-pagination";
import {
  authorizePublicApiRequest,
  publicApiErrorResponse,
  readPublicApiJson
} from "@/lib/public-api/request";
import { customerWebhookEndpointCreateSchema } from "@/lib/validation/customer-webhooks";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "POST"]);
export {
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

export async function GET(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["webhooks:read"]);
  if (!authorization.ok) {
    return authorization.response;
  }
  try {
    const binding = { orgId: authorization.principal.orgId, resource: "webhook-endpoints" } as const;
    const query = parsePublicApiCollectionQuery(request, binding);
    const endpoints = await listCustomerWebhookEndpoints(
      authorization.principal.orgId,
      undefined,
      { limit: query.limit + 1, cursor: query.cursor }
    );
    const positioned = endpoints.map((endpoint) => ({
      id: endpoint.id,
      createdAt: new Date(endpoint.createdAt),
      endpoint
    }));
    const page = createPublicApiPage(positioned, query, binding);
    return createPublicApiSuccessResponse(
      { endpoints: page.rows.map((row) => row.endpoint) },
      {
        requestId: authorization.requestId,
        meta: page.pagination,
        headers: authorization.responseHeaders
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["webhooks:write"]);
  if (!authorization.ok) {
    return authorization.response;
  }
  try {
    const requestBody = await readPublicApiJson(request);
    const payload = customerWebhookEndpointCreateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/webhook-endpoints",
      requestBody,
      async (tx) => {
        // DNS is deliberately inside the idempotent mutation callback. Exact replays return the
        // encrypted snapshot without re-resolving an endpoint whose DNS may have changed.
        const canonicalUrl = await validateCustomerWebhookEndpointDestination(payload.url);
        const revealed = await createCustomerWebhookEndpoint(
          {
            orgId: authorization.principal.orgId,
            ...payload,
            url: canonicalUrl,
            actor: { kind: "api_credential", credentialId: authorization.principal.credentialId }
          },
          tx
        );
        return publicApiSuccessSnapshot(toPublicApiJson(revealed), authorization.requestId, 201);
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
