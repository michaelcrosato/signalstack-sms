import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  createPublicCampaign,
  publicCampaignSelect,
  serializePublicCampaign
} from "@/lib/public-api/campaigns";
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
import {
  authorizePublicApiRequest,
  publicApiErrorResponse,
  readPublicApiJson
} from "@/lib/public-api/request";
import { publicCampaignCreateSchema } from "@/lib/validation/public-api-campaigns-conversations";

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
  const authorization = await authorizePublicApiRequest(request, ["campaigns:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const binding = { orgId: authorization.principal.orgId, resource: "campaigns" } as const;
    const query = parsePublicApiCollectionQuery(request, binding);
    const rows = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
      tx.campaign.findMany({
        where: {
          orgId: authorization.principal.orgId,
          ...publicApiCursorWhere(query.cursor)
        },
        select: publicCampaignSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1
      })
    );
    const page = createPublicApiPage(rows, query, binding);
    return createPublicApiSuccessResponse(
      { campaigns: page.rows.map(serializePublicCampaign) },
      {
        requestId: authorization.requestId,
        headers: authorization.responseHeaders,
        meta: page.pagination
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["campaigns:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const requestBody = await readPublicApiJson(request);
    const input = publicCampaignCreateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/campaigns",
      requestBody,
      async (tx) => {
        const result = await createPublicCampaign(
          tx,
          authorization.principal.orgId,
          input
        );
        if (!result.ok) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "The campaign references are invalid."
          );
        }
        return publicApiSuccessSnapshot(
          toPublicApiJson({ campaign: result.data }),
          authorization.requestId,
          201,
          { location: `/api/v1/campaigns/${result.data.id}` }
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
