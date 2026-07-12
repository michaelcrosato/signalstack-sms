import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import {
  publicOrganizationSelect,
  serializePublicOrganization
} from "@/lib/public-api/resource-dtos";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

export async function GET(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["organization:read"]);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const organization = await withTenantTransaction(
      { orgId: authorization.principal.orgId },
      (tx) =>
        tx.organization.findFirst({
          where: { id: authorization.principal.orgId },
          select: publicOrganizationSelect
        })
    );
    if (!organization) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }

    return createPublicApiSuccessResponse(serializePublicOrganization(organization), {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}
