import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicListSelect, serializePublicList } from "@/lib/public-api/resource-dtos";
import { publicApiSuccessSnapshot, runPublicApiIdempotentMutation, toPublicApiJson } from "@/lib/public-api/resource-mutations";
import { createPublicApiPage, parsePublicApiCollectionQuery, publicApiCursorWhere } from "@/lib/public-api/resource-pagination";
import { authorizePublicApiRequest, publicApiErrorResponse, readPublicApiJson } from "@/lib/public-api/request";
import { publicListCreateSchema } from "@/lib/validation/public-api-resources";

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
  const authorization = await authorizePublicApiRequest(request, ["lists:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const binding = { orgId: authorization.principal.orgId, resource: "lists" };
    const query = parsePublicApiCollectionQuery(request, binding);
    const rows = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) => tx.contactList.findMany({
      where: { orgId: authorization.principal.orgId, ...(publicApiCursorWhere(query.cursor) ?? {}) },
      select: publicListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1
    }));
    const page = createPublicApiPage(rows, query, binding);
    return createPublicApiSuccessResponse({ lists: page.rows.map(serializePublicList) }, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders,
      meta: page.pagination
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["lists:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const requestBody = await readPublicApiJson(request);
    const input = publicListCreateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(request, authorization, "/api/v1/lists", requestBody, async (tx) => {
      const list = await tx.contactList.create({ data: { orgId: authorization.principal.orgId, ...input }, select: publicListSelect });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicList(list)), authorization.requestId, 201, { location: `/api/v1/lists/${list.id}` });
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}
