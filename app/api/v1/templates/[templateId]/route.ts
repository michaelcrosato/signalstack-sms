import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicTemplateSelect, serializePublicTemplate } from "@/lib/public-api/resource-dtos";
import { assertPublicApiRequestHasNoBody, publicApiErrorSnapshot, publicApiSuccessSnapshot, runPublicApiIdempotentMutation, toPublicApiJson } from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import { publicApiResourceIdSchema, publicTemplateUpdateSchema } from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = Readonly<{ params: Promise<{ templateId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["templates:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const templateId = publicApiResourceIdSchema.parse((await context.params).templateId);
    const template = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) => tx.messageTemplate.findFirst({ where: { orgId: authorization.principal.orgId, id: templateId }, select: publicTemplateSelect }));
    if (!template) return createPublicApiErrorResponse({ requestId: authorization.requestId, code: "NOT_FOUND", headers: authorization.responseHeaders });
    return createPublicApiSuccessResponse(serializePublicTemplate(template), { requestId: authorization.requestId, headers: authorization.responseHeaders });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["templates:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const templateId = publicApiResourceIdSchema.parse((await context.params).templateId);
    const requestBody = await readPublicApiJson(request);
    const input = publicTemplateUpdateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/templates/${templateId}`, requestBody, async (tx) => {
      const existing = await tx.messageTemplate.findFirst({ where: { orgId: authorization.principal.orgId, id: templateId }, select: { id: true } });
      if (!existing) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      const template = await tx.messageTemplate.update({ where: { id: templateId }, data: input, select: publicTemplateSelect });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicTemplate(template)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["templates:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    const templateId = publicApiResourceIdSchema.parse((await context.params).templateId);
    return await runPublicApiIdempotentMutation(request, authorization, `/api/v1/templates/${templateId}`, {}, async (tx) => {
      const template = await tx.messageTemplate.findFirst({ where: { orgId: authorization.principal.orgId, id: templateId }, select: publicTemplateSelect });
      if (!template) return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
      if (template._count.campaigns > 0) {
        return publicApiErrorSnapshot("OPERATION_NOT_ALLOWED", authorization.requestId, 422, "A template used by campaigns cannot be deleted.");
      }
      await tx.messageTemplate.delete({ where: { id: template.id } });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicTemplate(template)), authorization.requestId);
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}
