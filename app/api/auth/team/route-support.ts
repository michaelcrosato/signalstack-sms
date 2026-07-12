import { NextResponse } from "next/server";
import type { AuthThrottleDecision } from "@/lib/auth/auth-throttle";
import { isTeamServiceError } from "@/lib/auth/team-service";

export const teamNoStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Expires: "0",
  Pragma: "no-cache"
});

export function teamServiceErrorResponse(error: unknown) {
  if (isTeamServiceError(error)) {
    return noStoreJson({ error: error.message, code: error.code }, error.status);
  }
  return noStoreJson(
    { error: "Team operation failed.", code: "TEAM_OPERATION_FAILED" },
    500
  );
}

export function teamManagementUnavailableResponse() {
  return noStoreJson(
    {
      error: "Team management is unavailable.",
      code: "TEAM_MANAGEMENT_UNAVAILABLE"
    },
    403
  );
}

export function invalidTeamRequestOriginResponse() {
  return noStoreJson(
    { error: "Invalid request origin.", code: "INVALID_REQUEST_ORIGIN" },
    403
  );
}

export function invalidTeamRequestResponse() {
  return noStoreJson(
    { error: "Team operation input is invalid.", code: "INVALID_INPUT" },
    400
  );
}

export function teamAuthenticationUnavailableResponse() {
  return noStoreJson(
    {
      error: "Authentication service unavailable.",
      code: "AUTH_SERVICE_UNAVAILABLE"
    },
    503
  );
}

export function teamAuthenticationRateLimitedResponse(
  decision: AuthThrottleDecision
) {
  const retryAfterSeconds =
    Number.isSafeInteger(decision.retryAfterSeconds) && decision.retryAfterSeconds > 0
      ? Math.min(decision.retryAfterSeconds, 604_800)
      : 1;
  return noStoreJson(
    {
      error: "Too many authentication attempts.",
      code: "AUTH_RATE_LIMITED"
    },
    429,
    { "Retry-After": retryAfterSeconds.toString() }
  );
}

export function noStoreJson(
  body: unknown,
  status: number,
  headers: HeadersInit = {}
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...teamNoStoreHeaders,
      ...Object.fromEntries(new Headers(headers))
    }
  });
}

export function withTeamNoStore(response: NextResponse) {
  for (const [name, value] of Object.entries(teamNoStoreHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}
