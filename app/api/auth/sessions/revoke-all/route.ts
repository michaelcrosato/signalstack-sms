import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { revokeAllLocalSessionsForOrganization } from "@/lib/auth/local-session";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import { clearLocalSessionCookie } from "@/lib/auth/session-cookie";
import { getRuntimeConfig } from "@/lib/env/runtime-config";

const noStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Expires: "0",
  Pragma: "no-cache"
});

export async function POST(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return withNoStore(authentication.response);
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.MEMBER);
  if (roleResponse) {
    return withNoStore(roleResponse);
  }

  let secure = process.env.NODE_ENV === "production";
  try {
    const config = getRuntimeConfig();
    secure = config.runtime.environment === "production";
    if (config.auth.mode !== "local") {
      return noStoreJson(
        {
          error: "Local session management is unavailable.",
          code: "SESSION_MANAGEMENT_UNAVAILABLE"
        },
        403
      );
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return noStoreJson(
        { error: "Invalid request origin.", code: "INVALID_REQUEST_ORIGIN" },
        403
      );
    }

    const revokedSessions = await revokeAllLocalSessionsForOrganization(
      currentOrg.userId,
      currentOrg.orgId
    );
    if (revokedSessions === null) {
      throw new Error("Authenticated session revocation did not mutate its subject.");
    }
    const response = noStoreJson({ revokedSessions }, 200);
    clearLocalSessionCookie(response, { secure });
    return response;
  } catch {
    const response = noStoreJson(
      { error: "Authentication service unavailable.", code: "AUTH_SERVICE_UNAVAILABLE" },
      503
    );
    clearLocalSessionCookie(response, { secure });
    return response;
  }
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
