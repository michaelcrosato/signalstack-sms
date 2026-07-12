import { CUSTOMER_WEBHOOK_EVENT_TYPES } from "@/lib/integrations/customer-webhooks/catalog";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { authorizePublicApiRequest } from "@/lib/public-api/request";
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

export async function GET(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["webhooks:read"]);
  if (!authorization.ok) {
    return authorization.response;
  }
  return createPublicApiSuccessResponse(
    { eventTypes: CUSTOMER_WEBHOOK_EVENT_TYPES },
    {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    }
  );
}
