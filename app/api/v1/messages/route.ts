import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  publicMessageSelect,
  serializePublicMessage
} from "@/lib/public-api/dummy-messages";
import {
  reserveDirectMessage,
  resolveDirectMessageTransport
} from "@/lib/messaging/direct-message-reservation";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
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
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import { publicMessageCreateSchema } from "@/lib/validation/public-api-resources";

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
  const authorization = await authorizePublicApiRequest(request, ["messages:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const binding = { orgId: authorization.principal.orgId, resource: "messages" } as const;
    const query = parsePublicApiCollectionQuery(request, binding);
    const rows = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
      tx.message.findMany({
        where: { orgId: authorization.principal.orgId, ...publicApiCursorWhere(query.cursor) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: publicMessageSelect
      })
    );
    const page = createPublicApiPage(rows, query, binding);
    return createPublicApiSuccessResponse(
      { messages: page.rows.map(serializePublicMessage) },
      { requestId: authorization.requestId, meta: page.pagination, headers: authorization.responseHeaders }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["messages:send"]);
  if (!authorization.ok) return authorization.response;
  try {
    const requestBody = await readPublicApiJson(request);
    const payload = publicMessageCreateSchema.parse(requestBody);
    const transport = resolveDirectMessageTransport();
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/messages",
      requestBody,
      async (tx) => {
        if (!transport) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "The configured direct-message transport is unavailable."
          );
        }
        const submission = await reserveDirectMessage(tx, {
          orgId: authorization.principal.orgId,
          route: "public_direct",
          identity: {
            kind: "public_api",
            credentialId: authorization.principal.credentialId,
            idempotencyKey: request.headers.get("idempotency-key") ?? ""
          },
          transport,
          ...payload
        });
        if (!submission.ok && submission.kind === "not_found") {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        if (!submission.ok && submission.kind === "conflict") {
          return publicApiErrorSnapshot("IDEMPOTENCY_CONFLICT", authorization.requestId, 409);
        }
        if (!submission.ok) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            `Message acceptance blocked: ${submission.reasons.join(", ")}.`
          );
        }
        const message = await tx.message.findUniqueOrThrow({
          where: { id: submission.message.id },
          select: publicMessageSelect
        });
        return publicApiSuccessSnapshot(
          toPublicApiJson({ message: serializePublicMessage(message) }),
          authorization.requestId,
          202,
          { Location: `/api/v1/messages/${submission.message.id}` }
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
