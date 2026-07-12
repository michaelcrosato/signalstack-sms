import { createHash } from "node:crypto";
import { listCustomerWebhookDeliveries } from "@/lib/integrations/customer-webhooks/service";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { createPublicApiPage, parsePublicApiCollectionQuery } from "@/lib/public-api/resource-pagination";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
import { customerWebhookIdentifierSchema } from "@/lib/validation/customer-webhooks";
import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = { params: Promise<{ endpointId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["deliveries:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const endpointId = customerWebhookIdentifierSchema.parse((await context.params).endpointId);
    const binding = {
      orgId: authorization.principal.orgId,
      resource: webhookDeliveryCursorResource(endpointId)
    } as const;
    const query = parsePublicApiCollectionQuery(request, binding);
    const deliveries = await listCustomerWebhookDeliveries(
      authorization.principal.orgId,
      endpointId,
      undefined,
      { limit: query.limit + 1, cursor: query.cursor }
    );
    const positioned = deliveries.map((delivery) => ({
      id: delivery.id,
      createdAt: new Date(delivery.createdAt),
      delivery
    }));
    const page = createPublicApiPage(positioned, query, binding);
    return createPublicApiSuccessResponse(
      { deliveries: page.rows.map((row) => row.delivery) },
      { requestId: authorization.requestId, meta: page.pagination, headers: authorization.responseHeaders }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}

function webhookDeliveryCursorResource(endpointId: string): string {
  const digest = createHash("sha256")
    .update(`signalstack/webhook-deliveries-cursor/v1\0${endpointId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `webhook-deliveries-${digest}`;
}
