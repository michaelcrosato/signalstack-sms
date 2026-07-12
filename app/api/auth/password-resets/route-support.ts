import { NextResponse } from "next/server";
import type { AuthThrottleDecision } from "@/lib/auth/auth-throttle";
import { isPasswordResetServiceError } from "@/lib/auth/password-reset-service";

export const passwordResetNoStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Expires: "0",
  Pragma: "no-cache"
});

export function passwordResetCompletionErrorResponse(error: unknown) {
  if (
    isPasswordResetServiceError(error) &&
    error.code !== "PASSWORD_RESET_OPERATION_FAILED"
  ) {
    return passwordResetDeniedResponse();
  }
  return passwordResetServiceUnavailableResponse();
}

export function passwordResetManagementUnavailableResponse() {
  return passwordResetNoStoreJson(
    {
      error: "Password reset is unavailable.",
      code: "PASSWORD_RESET_UNAVAILABLE"
    },
    403
  );
}

export function invalidPasswordResetOriginResponse() {
  return passwordResetNoStoreJson(
    { error: "Invalid request origin.", code: "INVALID_REQUEST_ORIGIN" },
    403
  );
}

export function passwordResetDeniedResponse() {
  return passwordResetNoStoreJson(
    {
      error: "Password reset is unavailable.",
      code: "PASSWORD_RESET_UNAVAILABLE"
    },
    400
  );
}

export function passwordResetRateLimitedResponse(decision: AuthThrottleDecision) {
  const retryAfterSeconds =
    Number.isSafeInteger(decision.retryAfterSeconds) && decision.retryAfterSeconds > 0
      ? Math.min(decision.retryAfterSeconds, 604_800)
      : 1;
  return passwordResetNoStoreJson(
    {
      error: "Too many authentication attempts.",
      code: "AUTH_RATE_LIMITED"
    },
    429,
    { "Retry-After": retryAfterSeconds.toString() }
  );
}

export function passwordResetServiceUnavailableResponse() {
  return passwordResetNoStoreJson(
    {
      error: "Authentication service unavailable.",
      code: "AUTH_SERVICE_UNAVAILABLE"
    },
    503
  );
}

export function passwordResetNoStoreJson(
  body: unknown,
  status: number,
  headers: HeadersInit = {}
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...passwordResetNoStoreHeaders,
      ...Object.fromEntries(new Headers(headers))
    }
  });
}

export function withPasswordResetNoStore(response: NextResponse) {
  for (const [name, value] of Object.entries(passwordResetNoStoreHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}
