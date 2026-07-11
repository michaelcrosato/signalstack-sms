import { AuthThrottleScope, MembershipStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  createAuthThrottleService,
  extractClientNetwork,
  type AuthThrottleDecision
} from "@/lib/auth/auth-throttle";
import { createPrismaLocalCredentialService } from "@/lib/auth/local-credential-store";
import {
  createLocalSession,
  resolveLocalSession,
  revokeLocalSession,
  type ResolvedLocalSession
} from "@/lib/auth/local-session";
import {
  clearLocalSessionCookie,
  readLocalSessionToken,
  setLocalSessionCookie
} from "@/lib/auth/session-cookie";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import { withAuthDatabaseContext } from "@/lib/db/tenant-context";
import { getRuntimeConfig, type RuntimeConfig } from "@/lib/env/runtime-config";
import { authLoginSchema, authSetupSchema } from "@/lib/validation/auth";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export async function handleLocalAuthSetup(request: Request): Promise<NextResponse> {
  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return localAuthUnavailableResponse();
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidRequestOriginResponse();
    }

    const throttle = createConfiguredAuthThrottle();
    const networkDecision = await throttle.consume({
      scope: AuthThrottleScope.SETUP_NETWORK,
      evidence: requestNetworkEvidence(request, config)
    });
    if (!networkDecision.allowed) {
      return authenticationRateLimitedResponse(networkDecision);
    }

    const payload = authSetupSchema.safeParse(await readJsonBody(request));
    if (!payload.success) {
      return noStoreJson({ error: "Invalid setup request." }, 400);
    }

    const credentials = await createPrismaLocalCredentialService({
      bootstrapToken: process.env.BOOTSTRAP_TOKEN
    });
    const result = await credentials.bootstrapFirstOwner(payload.data);
    if (!result.created) {
      return result.code === "BOOTSTRAP_INPUT_INVALID"
        ? noStoreJson({ error: "Invalid setup request." }, 400)
        : noStoreJson({ error: "Setup is unavailable." }, 403);
    }

    const created = await createConfiguredSession(
      {
        userId: result.user.id,
        orgId: result.organization.id,
        expectedAuthVersion: result.user.authVersion
      },
      config
    );
    const response = noStoreJson({ session: publicSession(created.session) }, 201);
    setLocalSessionCookie(response, {
      token: created.token,
      expiresAt: created.session.absoluteExpiresAt,
      secure: cookieIsSecure(config)
    });
    return response;
  } catch {
    return authenticationServiceUnavailableResponse();
  }
}

export async function handleLocalAuthLogin(request: Request): Promise<NextResponse> {
  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return localAuthUnavailableResponse();
    }
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidRequestOriginResponse();
    }

    const throttle = createConfiguredAuthThrottle();
    const networkDecision = await throttle.consume({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: requestNetworkEvidence(request, config)
    });
    if (!networkDecision.allowed) {
      return authenticationRateLimitedResponse(networkDecision);
    }

    const payload = authLoginSchema.safeParse(await readJsonBody(request));
    if (!payload.success) {
      return noStoreJson({ error: "Invalid login request." }, 400);
    }

    const identityDecision = await throttle.consume({
      scope: AuthThrottleScope.LOGIN_EMAIL,
      evidence: payload.data.email
    });
    if (!identityDecision.allowed) {
      return authenticationRateLimitedResponse(identityDecision);
    }

    const credentials = await createPrismaLocalCredentialService();
    const result = await credentials.authenticate({
      email: payload.data.email,
      password: payload.data.password
    });
    if (!result.authenticated) {
      return invalidCredentialsResponse();
    }

    const membership = await withAuthDatabaseContext(
      { userId: result.user.id, purpose: "login" },
      (client) => client.membership.findFirst({
        where: { userId: result.user.id, status: MembershipStatus.ACTIVE },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { orgId: true }
      })
    );
    if (!membership) {
      return invalidCredentialsResponse();
    }

    const secure = cookieIsSecure(config);
    const priorToken = readLocalSessionToken(request, { secure });
    if (priorToken) {
      await revokeLocalSession(priorToken);
    }

    const created = await createConfiguredSession(
      {
        userId: result.user.id,
        orgId: membership.orgId,
        expectedAuthVersion: result.user.authVersion
      },
      config
    );
    const response = noStoreJson(
      {
        session: publicSession(created.session),
        redirectTo: payload.data.redirectTo
      },
      200
    );
    setLocalSessionCookie(response, {
      token: created.token,
      expiresAt: created.session.absoluteExpiresAt,
      secure
    });
    return response;
  } catch {
    return authenticationServiceUnavailableResponse();
  }
}

export async function handleLocalAuthLogout(request: Request): Promise<NextResponse> {
  let secure = process.env.NODE_ENV === "production";

  try {
    const config = getRuntimeConfig();
    secure = cookieIsSecure(config);
    if (!requestHasTrustedOrigin(request, config.web)) {
      return invalidRequestOriginResponse();
    }
    const token = readLocalSessionToken(request, { secure });
    if (token) {
      await revokeLocalSession(token);
    }

    const response = noStoreEmptyResponse(204);
    clearLocalSessionCookie(response, { secure });
    return response;
  } catch {
    const response = authenticationServiceUnavailableResponse();
    clearLocalSessionCookie(response, { secure });
    return response;
  }
}

export async function handleLocalAuthSession(request: Request): Promise<NextResponse> {
  try {
    const config = getRuntimeConfig();
    if (config.auth.mode !== "local") {
      return authenticationRequiredResponse();
    }

    const secure = cookieIsSecure(config);
    const token = readLocalSessionToken(request, { secure });
    if (!token) {
      return clearUnauthenticatedResponse(secure);
    }

    const session = await resolveLocalSession(token);
    if (!session) {
      return clearUnauthenticatedResponse(secure);
    }

    return noStoreJson({ session: publicSession(session) }, 200);
  } catch {
    return authenticationServiceUnavailableResponse();
  }
}

async function createConfiguredSession(
  input: Readonly<{ userId: string; orgId: string; expectedAuthVersion?: number }>,
  config: RuntimeConfig
) {
  return createLocalSession(input, {
    policy: {
      idleTtlMs: config.auth.sessionIdleMinutes * MINUTE_MS,
      absoluteTtlMs: config.auth.sessionAbsoluteHours * HOUR_MS
    }
  });
}

function createConfiguredAuthThrottle() {
  return createAuthThrottleService({
    secret: process.env.AUTH_THROTTLE_SECRET ?? ""
  });
}

function requestNetworkEvidence(request: Request, config: RuntimeConfig) {
  return (
    extractClientNetwork({
      headers: request.headers,
      trustForwardedHeaders: config.web.trustProxy
    }) ?? "0.0.0.0"
  );
}

function publicSession(session: ResolvedLocalSession) {
  return Object.freeze({
    user: Object.freeze({
      id: session.userId,
      email: session.email,
      displayName: session.displayName
    }),
    organization: Object.freeze({
      id: session.orgId,
      slug: session.orgSlug,
      name: session.orgName,
      demoMode: session.demoMode
    }),
    membership: Object.freeze({ role: session.role }),
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt.toISOString()
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function cookieIsSecure(config: RuntimeConfig) {
  return config.runtime.environment === "production";
}

function localAuthUnavailableResponse() {
  return noStoreJson({ error: "Local authentication is unavailable." }, 403);
}

function invalidCredentialsResponse() {
  return noStoreJson({ error: "Invalid email or password." }, 401);
}

function invalidRequestOriginResponse() {
  return noStoreJson({ error: "Invalid request origin." }, 403);
}

function authenticationRequiredResponse() {
  return noStoreJson({ error: "Authentication required." }, 401);
}

function authenticationRateLimitedResponse(decision: AuthThrottleDecision) {
  const retryAfterSeconds =
    Number.isSafeInteger(decision.retryAfterSeconds) && decision.retryAfterSeconds > 0
      ? Math.min(decision.retryAfterSeconds, 604_800)
      : 1;
  return noStoreJson(
    { error: "Too many authentication attempts." },
    429,
    { "Retry-After": retryAfterSeconds.toString() }
  );
}

function clearUnauthenticatedResponse(secure: boolean) {
  const response = authenticationRequiredResponse();
  clearLocalSessionCookie(response, { secure });
  return response;
}

function authenticationServiceUnavailableResponse() {
  return noStoreJson({ error: "Authentication service unavailable." }, 503);
}

function noStoreJson(body: unknown, status: number, headers: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...noStoreHeaders(), ...Object.fromEntries(new Headers(headers)) }
  });
}

function noStoreEmptyResponse(status: number) {
  return new NextResponse(null, {
    status,
    headers: noStoreHeaders()
  });
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    Expires: "0",
    Pragma: "no-cache"
  };
}
