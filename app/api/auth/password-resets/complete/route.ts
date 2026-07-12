import { AuthThrottleScope } from "@prisma/client";
import {
  createAuthThrottleService,
  extractClientNetwork
} from "@/lib/auth/auth-throttle";
import { completePasswordReset } from "@/lib/auth/password-reset-service";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import { clearLocalSessionCookie } from "@/lib/auth/session-cookie";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import { passwordResetCompleteSchema } from "@/lib/validation/auth";
import {
  invalidPasswordResetOriginResponse,
  passwordResetCompletionErrorResponse,
  passwordResetDeniedResponse,
  passwordResetManagementUnavailableResponse,
  passwordResetNoStoreJson,
  passwordResetRateLimitedResponse,
  passwordResetServiceUnavailableResponse
} from "@/app/api/auth/password-resets/route-support";

export async function POST(request: Request) {
  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return passwordResetManagementUnavailableResponse();
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidPasswordResetOriginResponse();
    }

    const throttle = createAuthThrottleService({
      secret: process.env.AUTH_THROTTLE_SECRET ?? ""
    });
    const decision = await throttle.consume({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence:
        extractClientNetwork({
          headers: request.headers,
          trustForwardedHeaders: config.web.trustProxy
        }) ?? "0.0.0.0"
    });
    if (!decision.allowed) {
      return passwordResetRateLimitedResponse(decision);
    }

    const payload = passwordResetCompleteSchema.safeParse(
      await request.json().catch(() => undefined)
    );
    if (!payload.success) {
      return passwordResetDeniedResponse();
    }

    await completePasswordReset(payload.data);
    const response = passwordResetNoStoreJson({ completed: true }, 200);
    clearLocalSessionCookie(response, {
      secure: config.runtime.environment === "production"
    });
    return response;
  } catch (error) {
    return error instanceof Error
      ? passwordResetCompletionErrorResponse(error)
      : passwordResetServiceUnavailableResponse();
  }
}
