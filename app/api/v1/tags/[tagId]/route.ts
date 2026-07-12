import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicTagSelect, serializePublicTag } from "@/lib/public-api/resource-dtos";
import {
  assertPublicApiRequestHasNoBody,
  publicApiErrorSnapshot,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { publicApiResourceIdSchema, publicTagUpdateSchema } from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = Readonly<{ params: Promise<{ tagId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["tags:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const tagId = publicApiResourceIdSchema.parse((await context.params).tagId);
    const tag = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
      tx.tag.findFirst({ where: { orgId: authorization.principal.orgId, id: tagId }, select: publicTagSelect })
    );
    if (!tag) return createPublicApiErrorResponse({ requestId: authorization.requestId, code: "NOT_FOUND", headers: authorization.responseHeaders });
    return createPublicApiSuccessResponse(serializePublicTag(tag), { requestId: authorization.requestId, headers: authorization.responseHeaders });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["tags:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const tagId = publicApiResourceIdSchema.parse((await context.params).tagId);
    const requestBody = await readPublicApiJson(request);
    const input = publicTagUpdateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/tags/${tagId}`, requestBody, async (tx) => {
      const existing = await tx.tag.findFirst({ where: { orgId: authorization.principal.orgId, id: tagId }, select: { id: true } });
      if (!existing) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      const tag = await tx.tag.update({ where: { id: tagId }, data: input, select: publicTagSelect });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicTag(tag)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["tags:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    const tagId = publicApiResourceIdSchema.parse((await context.params).tagId);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/tags/${tagId}`, {}, async (tx) => {
      const tag = await tx.tag.findFirst({ where: { orgId: authorization.principal.orgId, id: tagId }, select: publicTagSelect });
      if (!tag) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      await tx.tag.delete({ where: { id: tag.id } });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicTag(tag)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}
