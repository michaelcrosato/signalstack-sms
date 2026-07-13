import type { Prisma } from "@prisma/client";
import { withAuthDatabaseContext, withTenantTransaction } from "@/lib/db/tenant-context";
import {
  hashApiClientAddress,
  hashApiKey,
  parseBearerApiKey,
  readApiKeyPepper
} from "@/lib/public-api/api-key-crypto";
import { isApiScope, normalizeApiScopes, type ApiScope } from "@/lib/public-api/scopes";

const RATE_WINDOW_MILLISECONDS = 60_000;

export type PublicApiPrincipal = Readonly<{
  orgId: string;
  credentialId: string;
  prefix: string;
  scopes: readonly ApiScope[];
}>;

export type PublicApiCredentialLookup = Readonly<{
  id: string;
  orgId: string;
  prefix: string;
  secretHash: string;
}>;

export type PublicApiRateLimit = Readonly<{
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}>;

export type PublicApiCredentialConsumption =
  | Readonly<{
      outcome: "accepted";
      principal: PublicApiPrincipal;
      rateLimit: PublicApiRateLimit;
    }>
  | Readonly<{ outcome: "invalid" }>
  | Readonly<{
      outcome: "rate_limited";
      rateLimit: PublicApiRateLimit;
    }>;

export type PublicApiAuthenticationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_API_KEY"
  | "INSUFFICIENT_SCOPE"
  | "RATE_LIMIT_EXCEEDED"
  | "SERVICE_UNAVAILABLE";

export type PublicApiAuthenticationResult =
  | Readonly<{
      ok: true;
      principal: PublicApiPrincipal;
      rateLimit: PublicApiRateLimit;
      headers: Readonly<Record<string, string>>;
    }>
  | Readonly<{
      ok: false;
      status: 401 | 403 | 429 | 503;
      code: PublicApiAuthenticationErrorCode;
      message: string;
      headers: Readonly<Record<string, string>>;
    }>;

export type PublicApiAuthenticationDependencies = Readonly<{
  readPepper: () => string;
  resolveCredential: (secretHash: string) => Promise<PublicApiCredentialLookup | null>;
  consumeCredential: (
    lookup: PublicApiCredentialLookup,
    clientAddressHash: string | null
  ) => Promise<PublicApiCredentialConsumption>;
  getClientAddress: (request: Request) => string;
}>;

const defaultDependencies: PublicApiAuthenticationDependencies = Object.freeze({
  readPepper: () => readApiKeyPepper(),
  resolveCredential: resolveCredentialByHash,
  consumeCredential: consumeCredentialRateLimit,
  getClientAddress: getPublicApiClientAddress
});

/**
 * Authenticate and authorize a public route before any request-body reader is called. Browser
 * cookies are intentionally ignored: Authorization is the only credential source for /api/v1.
 */
export async function authenticatePublicApiKey(
  request: Request,
  requiredScopes: readonly ApiScope[],
  dependencies: PublicApiAuthenticationDependencies = defaultDependencies
): Promise<PublicApiAuthenticationResult> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return authFailure(
      401,
      "AUTHENTICATION_REQUIRED",
      "A bearer API key is required.",
      bearerChallenge()
    );
  }

  const parsed = parseBearerApiKey(authorization);
  if (!parsed) {
    return authFailure(
      401,
      "AUTHENTICATION_REQUIRED",
      "A valid bearer API key is required.",
      bearerChallenge("invalid_token")
    );
  }

  try {
    const pepper = dependencies.readPepper();
    const secretHash = hashApiKey(parsed.token, pepper);
    const lookup = await dependencies.resolveCredential(secretHash);
    if (!lookup || lookup.prefix !== parsed.prefix || lookup.secretHash !== secretHash) {
      return authFailure(401, "INVALID_API_KEY", "The API key is invalid.", bearerChallenge("invalid_token"));
    }

    const clientAddressHash = hashApiClientAddress(dependencies.getClientAddress(request), pepper);
    const consumption = await dependencies.consumeCredential(lookup, clientAddressHash);
    if (consumption.outcome === "invalid") {
      return authFailure(401, "INVALID_API_KEY", "The API key is invalid.", bearerChallenge("invalid_token"));
    }
    if (consumption.outcome === "rate_limited") {
      return authFailure(
        429,
        "RATE_LIMIT_EXCEEDED",
        "The API key rate limit was exceeded.",
        rateLimitHeaders(consumption.rateLimit)
      );
    }

    const rateHeaders = rateLimitHeaders(consumption.rateLimit);
    if (!requiredScopes.every((scope) => consumption.principal.scopes.includes(scope))) {
      return authFailure(
        403,
        "INSUFFICIENT_SCOPE",
        "The API key does not grant the required scope.",
        {
          ...rateHeaders,
          "WWW-Authenticate": `Bearer realm="signalstack-api", error="insufficient_scope", scope="${requiredScopes.join(" ")}"`
        }
      );
    }

    return Object.freeze({
      ok: true,
      principal: consumption.principal,
      rateLimit: consumption.rateLimit,
      headers: Object.freeze(rateHeaders)
    });
  } catch {
    return authFailure(
      503,
      "SERVICE_UNAVAILABLE",
      "The API authentication service is unavailable."
    );
  }
}

async function resolveCredentialByHash(
  secretHash: string
): Promise<PublicApiCredentialLookup | null> {
  return withAuthDatabaseContext(
    { apiKeyHash: secretHash, purpose: "api_key" },
    (tx) =>
      tx.apiCredential.findUnique({
        where: { secretHash },
        select: { id: true, orgId: true, prefix: true, secretHash: true }
      })
  );
}

async function consumeCredentialRateLimit(
  lookup: PublicApiCredentialLookup,
  clientAddressHash: string | null
): Promise<PublicApiCredentialConsumption> {
  return withTenantTransaction({ orgId: lookup.orgId }, async (tx) => {
    await lockCredential(tx, lookup.orgId, lookup.id);
    const [credential, databaseClock] = await Promise.all([
      tx.apiCredential.findFirst({ where: { orgId: lookup.orgId, id: lookup.id } }),
      tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    ]);
    const now = databaseClock[0]?.now;
    if (
      !credential ||
      !now ||
      credential.secretHash !== lookup.secretHash ||
      credential.prefix !== lookup.prefix ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt.getTime() <= now.getTime())
    ) {
      return Object.freeze({ outcome: "invalid" });
    }

    if (
      credential.scopes.some((scope) => !isApiScope(scope)) ||
      credential.rateLimitPerMinute < 1 ||
      credential.rateLimitPerMinute > 10_000
    ) {
      throw new Error("API credential policy is invalid.");
    }

    const startsNewWindow =
      !credential.rateWindowStartedAt ||
      credential.rateWindowStartedAt.getTime() + RATE_WINDOW_MILLISECONDS <= now.getTime();
    const windowStartedAt = startsNewWindow ? now : credential.rateWindowStartedAt!;
    const currentCount = startsNewWindow ? 0 : credential.rateRequestCount;
    const resetAt = new Date(windowStartedAt.getTime() + RATE_WINDOW_MILLISECONDS);
    if (currentCount >= credential.rateLimitPerMinute) {
      return Object.freeze({
        outcome: "rate_limited",
        rateLimit: rateLimitSnapshot(credential.rateLimitPerMinute, 0, resetAt, now, true)
      });
    }

    const nextCount = currentCount + 1;
    await tx.apiCredential.update({
      where: { id: credential.id },
      data: {
        rateWindowStartedAt: windowStartedAt,
        rateRequestCount: nextCount,
        lastUsedAt: now,
        lastUsedIpHash: clientAddressHash
      }
    });

    return Object.freeze({
      outcome: "accepted",
      principal: Object.freeze({
        orgId: credential.orgId,
        credentialId: credential.id,
        prefix: credential.prefix,
        scopes: Object.freeze(normalizeApiScopes(credential.scopes))
      }),
      rateLimit: rateLimitSnapshot(
        credential.rateLimitPerMinute,
        credential.rateLimitPerMinute - nextCount,
        resetAt,
        now
      )
    });
  });
}

async function lockCredential(
  tx: Prisma.TransactionClient,
  orgId: string,
  credentialId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM "ApiCredential"
    WHERE "orgId" = ${orgId} AND id = ${credentialId}
    FOR UPDATE
  `;
}

function rateLimitSnapshot(
  limit: number,
  remaining: number,
  resetAt: Date,
  now: Date,
  limited = false
): PublicApiRateLimit {
  return Object.freeze({
    limit,
    remaining: Math.max(remaining, 0),
    resetAt,
    retryAfterSeconds: limited ? Math.max(Math.ceil((resetAt.getTime() - now.getTime()) / 1_000), 1) : 0
  });
}

export function rateLimitHeaders(rateLimit: PublicApiRateLimit): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": rateLimit.limit.toString(),
    "RateLimit-Remaining": rateLimit.remaining.toString(),
    "RateLimit-Reset": Math.ceil(rateLimit.resetAt.getTime() / 1_000).toString()
  };
  if (rateLimit.retryAfterSeconds > 0) {
    headers["Retry-After"] = rateLimit.retryAfterSeconds.toString();
  }
  return headers;
}

function getPublicApiClientAddress(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && realIp.length <= 255) {
    return realIp;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  const connectingIp = forwarded?.split(",").at(-1)?.trim();
  return connectingIp && connectingIp.length <= 255 ? connectingIp : "unavailable";
}

function bearerChallenge(error?: "invalid_token"): Record<string, string> {
  return {
    "WWW-Authenticate": `Bearer realm="signalstack-api"${error ? `, error="${error}"` : ""}`
  };
}

function authFailure(
  status: 401 | 403 | 429 | 503,
  code: PublicApiAuthenticationErrorCode,
  message: string,
  headers: Readonly<Record<string, string>> = {}
): PublicApiAuthenticationResult {
  return Object.freeze({
    ok: false,
    status,
    code,
    message,
    headers: Object.freeze({ ...headers })
  });
}
