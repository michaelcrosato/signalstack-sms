import { rotateApiCredential } from "@/lib/public-api/api-credential-service";
import {
  assertPublicApiRequestHasNoBody,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";

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

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["credentials:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/api-keys/current/rotate",
      {},
      async (tx) => {
        const revealed = await rotateApiCredential(
          {
            orgId: authorization.principal.orgId,
            credentialId: authorization.principal.credentialId,
            expectedPrefix: authorization.principal.prefix,
            actor: { kind: "api_credential", credentialId: authorization.principal.credentialId }
          },
          tx
        );
        return publicApiSuccessSnapshot(toPublicApiJson(revealed), authorization.requestId, 200);
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
