import { schedulePublicCampaign } from "@/lib/public-api/campaigns";
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
import { publicCampaignScheduleSchema } from "@/lib/validation/public-api-campaigns-conversations";
import { publicApiResourceIdSchema } from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["POST"]);
export {
  methodNotAllowed as GET,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};
type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["campaigns:send"]);
  if (!authorization.ok) return authorization.response;
  try {
    const campaignId = publicApiResourceIdSchema.parse((await context.params).campaignId);
    const requestBody = await readPublicApiJson(request);
    const input = publicCampaignScheduleSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/campaigns/:campaignId/schedule",
      { campaignId, body: requestBody },
      async (tx) => {
        const result = await schedulePublicCampaign(
          tx,
          authorization.principal.orgId,
          campaignId,
          new Date(input.scheduledAt)
        );
        if (!result.ok && result.kind === "not_found") {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        if (!result.ok) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "The campaign cannot be scheduled."
          );
        }
        return publicApiSuccessSnapshot(
          toPublicApiJson(result.data),
          authorization.requestId,
          201
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
