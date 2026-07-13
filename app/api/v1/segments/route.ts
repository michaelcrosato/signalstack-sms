import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicSegmentSelect, serializePublicSegment } from "@/lib/public-api/resource-dtos";
import { publicApiSuccessSnapshot, runPublicApiIdempotentMutation, toPublicApiJson } from "@/lib/public-api/resource-mutations";
import { createPublicApiPage, parsePublicApiCollectionQuery, publicApiCursorWhere } from "@/lib/public-api/resource-pagination";
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import { publicSegmentCreateSchema } from "@/lib/validation/public-api-resources";

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
  const authorization = await authorizePublicApiRequest(request, ["segments:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const binding = { orgId: authorization.principal.orgId, resource: "segments" };
    const query = parsePublicApiCollectionQuery(request, binding);
    const rows = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) => tx.segment.findMany({
      where: { orgId: authorization.principal.orgId, ...(publicApiCursorWhere(query.cursor) ?? {}) },
      select: publicSegmentSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1
    }));
    const page = createPublicApiPage(rows, query, binding);
    return createPublicApiSuccessResponse({ segments: page.rows.map(serializePublicSegment) }, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders,
      meta: page.pagination
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["segments:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const requestBody = await readPublicApiJson(request);
    const input = publicSegmentCreateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(request, authorization, "/api/v1/segments", requestBody, async (tx) => {
      const segment = await tx.segment.create({
        data: { orgId: authorization.principal.orgId, name: input.name, description: input.description, definition: input.definition },
        select: publicSegmentSelect
      });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicSegment(segment)), authorization.requestId, 201, { location: `/api/v1/segments/${segment.id}` });
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}
