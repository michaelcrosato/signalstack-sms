import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicTagSelect, serializePublicTag } from "@/lib/public-api/resource-dtos";
import {
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
import { publicTagCreateSchema } from "@/lib/validation/public-api-resources";

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
  const authorization = await authorizePublicApiRequest(request, ["tags:read"]);
  if (!authorization.ok) return authorization.response;

  try {
    const binding = { orgId: authorization.principal.orgId, resource: "tags" };
    const query = parsePublicApiCollectionQuery(request, binding);
    const rows = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
      tx.tag.findMany({
        where: {
          orgId: authorization.principal.orgId,
          ...(publicApiCursorWhere(query.cursor) ?? {})
        },
        select: publicTagSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1
      })
    );
    const page = createPublicApiPage(rows, query, binding);
    return createPublicApiSuccessResponse({ tags: page.rows.map(serializePublicTag) }, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders,
      meta: page.pagination
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["tags:write"]);
  if (!authorization.ok) return authorization.response;

  try {
    const requestBody = await readPublicApiJson(request);
    const input = publicTagCreateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(request, authorization, "/api/v1/tags", requestBody, async (tx) => {
      const tag = await tx.tag.create({
        data: { orgId: authorization.principal.orgId, name: input.name, color: input.color },
        select: publicTagSelect
      });
      return publicApiSuccessSnapshot(toPublicApiJson(serializePublicTag(tag)), authorization.requestId, 201, {
        location: `/api/v1/tags/${tag.id}`
      });
    });
  } catch (error) {
    return publicApiErrorResponse(error, { requestId: authorization.requestId, headers: authorization.responseHeaders });
  }
}
