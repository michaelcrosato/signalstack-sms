import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import {
  createOrganizationForUser,
  isOrganizationServiceError,
  listOrganizationsForUser
} from "@/lib/auth/organization-service";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import { getRuntimeConfig } from "@/lib/env/runtime-config";

const noStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Expires: "0",
  Pragma: "no-cache"
});

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;

  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return organizationManagementUnavailableResponse();
    }
    const organizations = await listOrganizationsForUser({ userId: currentOrg.userId });
    return noStoreJson({ organizations }, 200);
  } catch (error) {
    return organizationServiceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.OWNER);
  if (roleResponse) {
    return withNoStore(roleResponse);
  }

  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return organizationManagementUnavailableResponse();
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidRequestOriginResponse();
    }

    const rawPayload = await request.json().catch(() => undefined);
    const membership = await createOrganizationForUser(
      { userId: currentOrg.userId },
      rawPayload
    );
    return noStoreJson(membership, 201);
  } catch (error) {
    return organizationServiceErrorResponse(error);
  }
}

function organizationServiceErrorResponse(error: unknown) {
  if (isOrganizationServiceError(error)) {
    return noStoreJson({ error: error.message, code: error.code }, error.status);
  }
  return noStoreJson(
    {
      error: "Organization operation failed.",
      code: "ORGANIZATION_OPERATION_FAILED"
    },
    500
  );
}

function organizationManagementUnavailableResponse() {
  return noStoreJson(
    {
      error: "Organization management is unavailable.",
      code: "ORGANIZATION_MANAGEMENT_UNAVAILABLE"
    },
    403
  );
}

function invalidRequestOriginResponse() {
  return noStoreJson(
    { error: "Invalid request origin.", code: "INVALID_REQUEST_ORIGIN" },
    403
  );
}

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

function withNoStore(response: NextResponse) {
  for (const [name, value] of Object.entries(noStoreHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}
