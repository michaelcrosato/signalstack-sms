import { cancelPublicCampaign } from "@/lib/public-api/campaigns";
import {
  assertPublicApiRequestHasNoBody,
  publicApiErrorSnapshot,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
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
    await assertPublicApiRequestHasNoBody(request);
    const campaignId = publicApiResourceIdSchema.parse((await context.params).campaignId);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/campaigns/:campaignId/cancel",
      { campaignId },
      async (tx) => {
        const result = await cancelPublicCampaign(
          tx,
          authorization.principal.orgId,
          campaignId
        );
        if (!result.ok && result.kind === "not_found") {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        if (!result.ok) {
          return publicApiErrorSnapshot(
            "OPERATION_NOT_ALLOWED",
            authorization.requestId,
            422,
            "The campaign cannot be canceled."
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
