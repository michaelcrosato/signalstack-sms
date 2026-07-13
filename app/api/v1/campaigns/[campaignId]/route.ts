import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  publicCampaignSelect,
  serializePublicCampaign,
  updatePublicCampaign
} from "@/lib/public-api/campaigns";
import {
  createPublicApiErrorResponse,
  createPublicApiSuccessResponse
} from "@/lib/public-api/envelope";
import {
  publicApiErrorSnapshot,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import {
  authorizePublicApiRequest,
  publicApiErrorResponse,
  readPublicApiJson
} from "@/lib/public-api/request";
import { publicCampaignUpdateSchema } from "@/lib/validation/public-api-campaigns-conversations";
import { publicApiResourceIdSchema } from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "PATCH"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["campaigns:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const campaignId = publicApiResourceIdSchema.parse((await context.params).campaignId);
    const campaign = await withTenantTransaction(
      { orgId: authorization.principal.orgId },
      (tx) =>
        tx.campaign.findFirst({
          where: { orgId: authorization.principal.orgId, id: campaignId },
          select: publicCampaignSelect
        })
    );
    if (!campaign) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }
    return createPublicApiSuccessResponse(
      { campaign: serializePublicCampaign(campaign) },
      { requestId: authorization.requestId, headers: authorization.responseHeaders }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["campaigns:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    const campaignId = publicApiResourceIdSchema.parse((await context.params).campaignId);
    const requestBody = await readPublicApiJson(request);
    const input = publicCampaignUpdateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/campaigns/:campaignId",
      { campaignId, body: requestBody },
      async (tx) => {
        const result = await updatePublicCampaign(
          tx,
          authorization.principal.orgId,
          campaignId,
          input
        );
        if (!result.ok && result.kind === "not_found") {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        if (!result.ok) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "Only a valid draft campaign can be updated."
          );
        }
        return publicApiSuccessSnapshot(
          toPublicApiJson({ campaign: result.data }),
          authorization.requestId
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
