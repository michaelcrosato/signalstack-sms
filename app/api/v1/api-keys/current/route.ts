import { getApiCredential, revokeApiCredential } from "@/lib/public-api/api-credential-service";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import {
  assertPublicApiRequestHasNoBody,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "DELETE"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

export async function GET(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["credentials:read"]);
  if (!authorization.ok) return authorization.response;
  try {
    const credential = await getApiCredential(
      authorization.principal.orgId,
      authorization.principal.credentialId
    );
    if (!credential) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }
    return createPublicApiSuccessResponse(
      { credential },
      { requestId: authorization.requestId, headers: authorization.responseHeaders }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["credentials:write"]);
  if (!authorization.ok) return authorization.response;
  try {
    await assertPublicApiRequestHasNoBody(request);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/api-keys/current",
      {},
      async (tx) => {
        const credential = await revokeApiCredential(
          {
            orgId: authorization.principal.orgId,
            credentialId: authorization.principal.credentialId,
            actor: { kind: "api_credential", credentialId: authorization.principal.credentialId }
          },
          tx
        );
        return publicApiSuccessSnapshot(
          toPublicApiJson({ credential }),
          authorization.requestId,
          200
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, authorization);
  }
}
