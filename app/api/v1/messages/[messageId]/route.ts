import { withTenantTransaction } from "@/lib/db/tenant-context";
import { publicMessageSelect, serializePublicMessage } from "@/lib/public-api/dummy-messages";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
import { publicApiResourceIdSchema } from "@/lib/validation/public-api-resources";
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
type RouteContext = { params: Promise<{ messageId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["messages:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const messageId = publicApiResourceIdSchema.parse((await context.params).messageId);
    const message = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
      tx.message.findFirst({
        where: { orgId: authorization.principal.orgId, id: messageId },
        select: publicMessageSelect
      })
    );
    if (!message) {
      return createPublicApiErrorResponse({ requestId: authorization.requestId, code: "NOT_FOUND", headers: authorization.responseHeaders });
    }
    return createPublicApiSuccessResponse(
      { message: serializePublicMessage(message) },
      { requestId: authorization.requestId, headers: authorization.responseHeaders }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
