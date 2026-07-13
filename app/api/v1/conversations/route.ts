import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  publicConversationSelect,
  serializePublicConversation
} from "@/lib/public-api/conversations";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import {
  createPublicApiPage,
  parsePublicApiCollectionQuery,
  publicApiCursorWhere
} from "@/lib/public-api/resource-pagination";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
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
  const authorization = await authorizePublicApiRequest(request, ["conversations:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const binding = {
      orgId: authorization.principal.orgId,
      resource: "conversations"
    } as const;
    const query = parsePublicApiCollectionQuery(request, binding);
    const rows = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
      tx.conversation.findMany({
        where: {
          orgId: authorization.principal.orgId,
          ...publicApiCursorWhere(query.cursor)
        },
        select: publicConversationSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1
      })
    );
    const page = createPublicApiPage(rows, query, binding);
    return createPublicApiSuccessResponse(
      { conversations: page.rows.map(serializePublicConversation) },
      {
        requestId: authorization.requestId,
        headers: authorization.responseHeaders,
        meta: page.pagination
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
