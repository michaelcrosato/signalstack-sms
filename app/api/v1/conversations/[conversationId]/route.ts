import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  publicConversationSelect,
  serializePublicConversation
} from "@/lib/public-api/conversations";
import {
  createPublicApiErrorResponse,
  createPublicApiSuccessResponse
} from "@/lib/public-api/envelope";
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
type RouteContext = Readonly<{ params: Promise<{ conversationId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["conversations:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const conversationId = publicApiResourceIdSchema.parse(
      (await context.params).conversationId
    );
    const conversation = await withTenantTransaction(
      { orgId: authorization.principal.orgId },
      (tx) =>
        tx.conversation.findFirst({
          where: { orgId: authorization.principal.orgId, id: conversationId },
          select: publicConversationSelect
        })
    );
    if (!conversation) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }
    return createPublicApiSuccessResponse(
      { conversation: serializePublicConversation(conversation) },
      { requestId: authorization.requestId, headers: authorization.responseHeaders }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
