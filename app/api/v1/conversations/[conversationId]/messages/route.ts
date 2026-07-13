import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  publicConversationMessagesCursorResource,
  publicConversationSelect
} from "@/lib/public-api/conversations";
import { publicMessageSelect, serializePublicMessage } from "@/lib/public-api/dummy-messages";
import {
  reserveDirectMessage,
  resolveDirectMessageTransport
} from "@/lib/messaging/direct-message-reservation";
import {
  createPublicApiErrorResponse,
  createPublicApiSuccessResponse
} from "@/lib/public-api/envelope";
import {
  publicApiErrorSnapshot,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import {
  createPublicApiPage,
  parsePublicApiCollectionQuery,
  publicApiCursorWhere
} from "@/lib/public-api/resource-pagination";
import {
  authorizePublicApiRequest,
  publicApiErrorResponse,
  readPublicApiJson
} from "@/lib/public-api/request";
import { publicConversationReplySchema } from "@/lib/validation/public-api-campaigns-conversations";
import { publicApiResourceIdSchema } from "@/lib/validation/public-api-resources";

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
type RouteContext = Readonly<{ params: Promise<{ conversationId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, [
    "conversations:read",
    "messages:read"
  ]);
  if (!authorization.ok) return authorization.response;
  try {
    const conversationId = publicApiResourceIdSchema.parse(
      (await context.params).conversationId
    );
    const binding = {
      orgId: authorization.principal.orgId,
      resource: publicConversationMessagesCursorResource(conversationId)
    } as const;
    const query = parsePublicApiCollectionQuery(request, binding);
    const result = await withTenantTransaction(
      { orgId: authorization.principal.orgId },
      async (tx) => {
        const conversation = await tx.conversation.findFirst({
          where: { orgId: authorization.principal.orgId, id: conversationId },
          select: { ...publicConversationSelect, id: true }
        });
        if (!conversation) return null;
        return tx.message.findMany({
          where: {
            orgId: authorization.principal.orgId,
            conversationId,
            ...publicApiCursorWhere(query.cursor)
          },
          select: publicMessageSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.limit + 1
        });
      }
    );
    if (!result) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }
    const page = createPublicApiPage(result, query, binding);
    return createPublicApiSuccessResponse(
      { messages: page.rows.map(serializePublicMessage) },
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

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, [
    "conversations:write",
    "messages:send"
  ]);
  if (!authorization.ok) return authorization.response;
  try {
    const conversationId = publicApiResourceIdSchema.parse(
      (await context.params).conversationId
    );
    const requestBody = await readPublicApiJson(request);
    const input = publicConversationReplySchema.parse(requestBody);
    const transport = resolveDirectMessageTransport();
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/conversations/:conversationId/messages",
      { conversationId, body: requestBody },
      async (tx) => {
        if (!transport) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "The configured direct-message transport is unavailable."
          );
        }
        const result = await reserveDirectMessage(tx, {
          orgId: authorization.principal.orgId,
          route: "public_conversation_reply",
          identity: {
            kind: "public_api",
            credentialId: authorization.principal.credentialId,
            idempotencyKey: request.headers.get("idempotency-key") ?? ""
          },
          transport,
          conversationId,
          body: input.body,
          mediaUrls: input.mediaUrls
        });
        if (!result.ok && result.kind === "not_found") {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        if (!result.ok && result.kind === "conflict") {
          return publicApiErrorSnapshot("IDEMPOTENCY_CONFLICT", authorization.requestId, 409);
        }
        if (!result.ok) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "The conversation cannot accept a reply."
          );
        }
        const message = await tx.message.findUniqueOrThrow({
          where: { id: result.message.id },
          select: publicMessageSelect
        });
        return publicApiSuccessSnapshot(
          toPublicApiJson({ message: serializePublicMessage(message) }),
          authorization.requestId,
          202,
          { Location: `/api/v1/messages/${result.message.id}` }
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
