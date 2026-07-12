import { AuthThrottleScope } from "@prisma/client";
import {
  createAuthThrottleService,
  extractClientNetwork
} from "@/lib/auth/auth-throttle";
import {
  createLocalSession,
  resolveLocalSession,
  switchLocalSessionOrganization
} from "@/lib/auth/local-session";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import {
  readLocalSessionToken,
  setLocalSessionCookie
} from "@/lib/auth/session-cookie";
import {
  acceptTeamInvite,
  isTeamServiceError,
  TeamServiceError
} from "@/lib/auth/team-service";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import { inviteAcceptSchema } from "@/lib/validation/auth";
import {
  invalidTeamRequestOriginResponse,
  noStoreJson,
  teamAuthenticationRateLimitedResponse,
  teamAuthenticationUnavailableResponse,
  teamManagementUnavailableResponse,
  teamServiceErrorResponse
} from "@/app/api/auth/team/route-support";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export async function POST(request: Request) {
  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return teamManagementUnavailableResponse();
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidTeamRequestOriginResponse();
    }

    const throttle = createAuthThrottleService({
      secret: process.env.AUTH_THROTTLE_SECRET ?? ""
    });
    const networkDecision = await throttle.consume({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence:
        extractClientNetwork({
          headers: request.headers,
          trustForwardedHeaders: config.web.trustProxy
        }) ?? "0.0.0.0"
    });
    if (!networkDecision.allowed) {
      return teamAuthenticationRateLimitedResponse(networkDecision);
    }

    const secure = config.runtime.environment === "production";
    const rawSessionToken = readLocalSessionToken(request, { secure });
    const resolvedSession = rawSessionToken
      ? await resolveLocalSession(rawSessionToken)
      : null;
    const rawPayload = await request.json().catch(() => undefined);
    const payload = inviteAcceptSchema.safeParse(rawPayload);
    if (!payload.success) {
      return teamServiceErrorResponse(new TeamServiceError("INVALID_INPUT"));
    }
    if (!resolvedSession && "email" in payload.data) {
      const identityDecision = await throttle.consume({
        scope: AuthThrottleScope.LOGIN_EMAIL,
        evidence: payload.data.email
      });
      if (!identityDecision.allowed) {
        return teamAuthenticationRateLimitedResponse(identityDecision);
      }
    }
    const accepted = await acceptTeamInvite(
      resolvedSession ? { userId: resolvedSession.userId } : null,
      payload.data
    );

    if (!resolvedSession) {
      if (typeof accepted.sessionAuthVersion !== "number") {
        return teamAuthenticationUnavailableResponse();
      }
      const created = await createLocalSession(
        {
          userId: accepted.member.userId,
          orgId: accepted.member.orgId,
          expectedAuthVersion: accepted.sessionAuthVersion
        },
        {
          policy: {
            idleTtlMs: config.auth.sessionIdleMinutes * MINUTE_MS,
            absoluteTtlMs: config.auth.sessionAbsoluteHours * HOUR_MS
          }
        }
      );
      const response = successfulAcceptanceResponse(accepted);
      setLocalSessionCookie(response, {
        token: created.token,
        expiresAt: created.session.absoluteExpiresAt,
        secure
      });
      return response;
    }

    if (!rawSessionToken || accepted.sessionAuthVersion !== null) {
      return teamAuthenticationUnavailableResponse();
    }
    const switched = await switchLocalSessionOrganization(
      rawSessionToken,
      accepted.member.orgId
    );
    if (
      !switched ||
      switched.userId !== accepted.member.userId ||
      switched.orgId !== accepted.member.orgId
    ) {
      return teamAuthenticationUnavailableResponse();
    }
    return successfulAcceptanceResponse(accepted);
  } catch (error) {
    return isTeamServiceError(error)
      ? teamServiceErrorResponse(error)
      : teamAuthenticationUnavailableResponse();
  }
}

function successfulAcceptanceResponse(accepted: Awaited<ReturnType<typeof acceptTeamInvite>>) {
  return noStoreJson(
    {
      member: accepted.member,
      accountCreated: accepted.accountCreated,
      redirectTo: "/team"
    },
    200
  );
}
