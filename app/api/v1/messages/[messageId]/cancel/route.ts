import { cancelDirectMessage } from "@/lib/messaging/direct-message-cancellation";
import { publicMessageSelect, serializePublicMessage } from "@/lib/public-api/dummy-messages";
import {
  assertPublicApiRequestHasNoBody,
  publicApiErrorSnapshot,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
import { publicApiResourceIdSchema } from "@/lib/validation/public-api-resources";
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

type RouteContext = Readonly<{ params: Promise<{ messageId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["messages:send"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    const messageId = publicApiResourceIdSchema.parse((await context.params).messageId);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/messages/:messageId/cancel",
      { messageId },
      async (tx) => {
        const result = await cancelDirectMessage(tx, authorization.principal.orgId, messageId);
        if (!result.ok && result.kind === "not_found") {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        if (!result.ok) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "The message can no longer be cancelled."
          );
        }
        const message = await tx.message.findUniqueOrThrow({
          where: { id: result.message.id },
          select: publicMessageSelect
        });
        return publicApiSuccessSnapshot(
          toPublicApiJson({ message: serializePublicMessage(message) }),
          authorization.requestId,
          200,
          { Location: `/api/v1/messages/${message.id}` }
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
