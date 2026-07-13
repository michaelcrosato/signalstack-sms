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

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["DELETE"]);
export {
  methodNotAllowed as GET,
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

type RouteContext = Readonly<{
  params: Promise<{ listId: string; contactId: string }>;
}>;

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["lists:write"]);
  if (!authorization.ok) return authorization.response;

  try {
    await assertPublicApiRequestHasNoBody(request);
    const params = await context.params;
    const listId = publicApiResourceIdSchema.parse(params.listId);
    const contactId = publicApiResourceIdSchema.parse(params.contactId);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      `/api/v1/lists/${listId}/contacts/${contactId}`,
      {},
      async (tx) => {
        const removed = await tx.contactListMember.deleteMany({
          where: {
            orgId: authorization.principal.orgId,
            listId,
            contactId
          }
        });
        if (removed.count !== 1) {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        return publicApiSuccessSnapshot(
          toPublicApiJson({ membership: { listId, contactId, removed: true } }),
          authorization.requestId
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}
