import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicSegmentSelect, serializePublicSegment } from "@/lib/public-api/resource-dtos";
import { assertPublicApiRequestHasNoBody, publicApiErrorSnapshot, publicApiSuccessSnapshot, runPublicApiIdempotentMutation, toPublicApiJson } from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import { publicApiResourceIdSchema, publicSegmentUpdateSchema } from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = Readonly<{ params: Promise<{ segmentId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["segments:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const segmentId = publicApiResourceIdSchema.parse((await context.params).segmentId);
    const segment = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) => tx.segment.findFirst({ where: { orgId: authorization.principal.orgId, id: segmentId }, select: publicSegmentSelect }));
    if (!segment) return createPublicApiErrorResponse({ requestId: authorization.requestId, code: "NOT_FOUND", headers: authorization.responseHeaders });
    return createPublicApiSuccessResponse(serializePublicSegment(segment), { requestId: authorization.requestId, headers: authorization.responseHeaders });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["segments:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const segmentId = publicApiResourceIdSchema.parse((await context.params).segmentId);
    const requestBody = await readPublicApiJson(request);
    const input = publicSegmentUpdateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/segments/${segmentId}`, requestBody, async (tx) => {
      const existing = await tx.segment.findFirst({ where: { orgId: authorization.principal.orgId, id: segmentId }, select: { id: true } });
      if (!existing) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      const segment = await tx.segment.update({
        where: { id: segmentId },
        data: { name: input.name, description: input.description, definition: input.definition },
        select: publicSegmentSelect
      });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicSegment(segment)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["segments:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    const segmentId = publicApiResourceIdSchema.parse((await context.params).segmentId);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/segments/${segmentId}`, {}, async (tx) => {
      const segment = await tx.segment.findFirst({ where: { orgId: authorization.principal.orgId, id: segmentId }, select: publicSegmentSelect });
      if (!segment) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      await tx.segment.delete({ where: { id: segment.id } });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicSegment(segment)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}
