import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicListSelect, serializePublicList } from "@/lib/public-api/resource-dtos";
import { assertPublicApiRequestHasNoBody, publicApiErrorSnapshot, publicApiSuccessSnapshot, runPublicApiIdempotentMutation, toPublicApiJson } from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import { publicApiResourceIdSchema, publicListUpdateSchema } from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = Readonly<{ params: Promise<{ listId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["lists:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const listId = publicApiResourceIdSchema.parse((await context.params).listId);
    const list = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) => tx.contactList.findFirst({ where: { orgId: authorization.principal.orgId, id: listId }, select: publicListSelect }));
    if (!list) return createPublicApiErrorResponse({ requestId: authorization.requestId, code: "NOT_FOUND", headers: authorization.responseHeaders });
    return createPublicApiSuccessResponse(serializePublicList(list), { requestId: authorization.requestId, headers: authorization.responseHeaders });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["lists:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const listId = publicApiResourceIdSchema.parse((await context.params).listId);
    const requestBody = await readPublicApiJson(request);
    const input = publicListUpdateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/lists/${listId}`, requestBody, async (tx) => {
      const existing = await tx.contactList.findFirst({ where: { orgId: authorization.principal.orgId, id: listId }, select: { id: true } });
      if (!existing) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      const list = await tx.contactList.update({ where: { id: listId }, data: input, select: publicListSelect });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicList(list)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["lists:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    const listId = publicApiResourceIdSchema.parse((await context.params).listId);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/lists/${listId}`, {}, async (tx) => {
      const list = await tx.contactList.findFirst({ where: { orgId: authorization.principal.orgId, id: listId }, select: publicListSelect });
      if (!list) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      await tx.contactList.delete({ where: { id: list.id } });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicList(list)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}
