import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { AuthThrottleScope, Prisma } from "@prisma/client";
import { withAuthDatabaseContext } from "@/lib/db/tenant-context";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const MIN_SECRET_CHARACTERS = 32;
const MAX_SECRET_CHARACTERS = 256;
const MAX_SECRET_BYTES = 512;
const MAX_EMAIL_CHARACTERS = 320;
const MAX_EMAIL_BYTES = 512;
const MAX_NETWORK_CHARACTERS = 64;
const MAX_FORWARDED_HEADER_CHARACTERS = 512;
const MAX_FORWARDED_HOPS = 16;
const MAX_ATTEMPTS = 10_000;
const MAX_WINDOW_MS = DAY_MS;
const MAX_BLOCK_DURATION_MS = 7 * DAY_MS;
const authThrottleScopes = new Set<AuthThrottleScope>(Object.values(AuthThrottleScope));

export type AuthThrottlePolicy = Readonly<{
  limit: number;
  windowMs: number;
  blockDurationMs: number;
}>;

export type AuthThrottleDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}>;

export type StoredAuthThrottleState = Readonly<{
  attempts: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
}>;

export type ConsumeStoredAuthThrottleInput = Readonly<{
  scope: AuthThrottleScope;
  keyHash: string;
  now: Date;
  policy: AuthThrottlePolicy;
}>;

export interface AuthThrottleStore {
  /** This operation must serialize callers for the same scope/keyHash pair. */
  consume(input: ConsumeStoredAuthThrottleInput): Promise<StoredAuthThrottleState>;
  inspect(scope: AuthThrottleScope, keyHash: string): Promise<StoredAuthThrottleState | null>;
}

export type AuthThrottlePolicyOverrides = Partial<
  Record<AuthThrottleScope, Partial<AuthThrottlePolicy>>
>;

export type CreateAuthThrottleServiceOptions = Readonly<{
  /** Server-only HMAC secret. It must contain at least 32 characters. */
  secret: string;
  store?: AuthThrottleStore;
  now?: () => Date;
  policies?: AuthThrottlePolicyOverrides;
}>;

export type AuthThrottleRequest = Readonly<{
  scope: AuthThrottleScope;
  /** Raw evidence is used only in memory to derive the HMAC key. */
  evidence: string;
}>;

export type ClientNetworkInput = Readonly<{
  headers: Headers;
  /** A socket-derived peer address supplied by the hosting adapter, when available. */
  directAddress?: string | null;
  /** Only enable when the operator's trusted proxy overwrites the forwarded headers. */
  trustForwardedHeaders: boolean;
}>;

export class AuthThrottleError extends Error {
  readonly code: "INVALID_CONFIGURATION" | "INVALID_INPUT" | "UNAVAILABLE";

  constructor(code: AuthThrottleError["code"]) {
    super(authThrottleErrorMessage(code));
    this.name = "AuthThrottleError";
    this.code = code;
  }
}

export const defaultAuthThrottlePolicies: Readonly<Record<AuthThrottleScope, AuthThrottlePolicy>> =
  Object.freeze({
    [AuthThrottleScope.LOGIN_EMAIL]: frozenPolicy(5, 15 * MINUTE_MS, 15 * MINUTE_MS),
    [AuthThrottleScope.LOGIN_NETWORK]: frozenPolicy(30, 15 * MINUTE_MS, 15 * MINUTE_MS),
    [AuthThrottleScope.SETUP_NETWORK]: frozenPolicy(5, HOUR_MS, HOUR_MS),
    [AuthThrottleScope.RESET_EMAIL]: frozenPolicy(3, HOUR_MS, HOUR_MS)
  });

export const prismaAuthThrottleStore: AuthThrottleStore = Object.freeze({
  async consume(input: ConsumeStoredAuthThrottleInput) {
    const { scope, keyHash, now, policy } = input;
    const id = randomUUID();
    const rows = await withAuthDatabaseContext(
      { tokenHash: keyHash, purpose: "login" },
      (client) => client.$queryRaw<StoredAuthThrottleState[]>(Prisma.sql`
        INSERT INTO "AuthThrottle" (
        "id",
        "scope",
        "keyHash",
        "windowStartedAt",
        "attempts",
        "blockedUntil",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${scope}::"AuthThrottleScope",
        ${keyHash},
        ${now},
        1,
        NULL,
        ${now}
      )
      ON CONFLICT ("scope", "keyHash") DO UPDATE SET
        "windowStartedAt" = CASE
          WHEN "AuthThrottle"."blockedUntil" > ${now}
            THEN "AuthThrottle"."windowStartedAt"
          WHEN ${now} >= "AuthThrottle"."windowStartedAt" + (${policy.windowMs} * INTERVAL '1 millisecond')
            THEN ${now}
          ELSE "AuthThrottle"."windowStartedAt"
        END,
        "attempts" = CASE
          WHEN "AuthThrottle"."blockedUntil" > ${now}
            THEN "AuthThrottle"."attempts"
          WHEN ${now} >= "AuthThrottle"."windowStartedAt" + (${policy.windowMs} * INTERVAL '1 millisecond')
            THEN 1
          WHEN "AuthThrottle"."attempts" >= ${policy.limit}
            THEN "AuthThrottle"."attempts"
          ELSE "AuthThrottle"."attempts" + 1
        END,
        "blockedUntil" = CASE
          WHEN "AuthThrottle"."blockedUntil" > ${now}
            THEN "AuthThrottle"."blockedUntil"
          WHEN ${now} >= "AuthThrottle"."windowStartedAt" + (${policy.windowMs} * INTERVAL '1 millisecond')
            THEN NULL
          WHEN "AuthThrottle"."attempts" >= ${policy.limit}
            THEN GREATEST(
              "AuthThrottle"."windowStartedAt" + (${policy.windowMs} * INTERVAL '1 millisecond'),
              ${now} + (${policy.blockDurationMs} * INTERVAL '1 millisecond')
            )
          ELSE NULL
        END,
        "updatedAt" = ${now}
        RETURNING
          "attempts",
          "windowStartedAt",
          "blockedUntil"
      `)
    );

    const state = rows[0];
    if (!state) {
      throw new Error("Auth throttle persistence did not return state.");
    }
    return state;
  },

  async inspect(scope: AuthThrottleScope, keyHash: string) {
    return withAuthDatabaseContext({ tokenHash: keyHash, purpose: "login" }, (client) =>
      client.authThrottle.findUnique({
        where: { scope_keyHash: { scope, keyHash } },
        select: {
          attempts: true,
          windowStartedAt: true,
          blockedUntil: true
        }
      })
    );
  }
});

export function createAuthThrottleService(options: CreateAuthThrottleServiceOptions) {
  const secret = validateSecret(options.secret);
  const store = options.store ?? prismaAuthThrottleStore;
  const now = options.now ?? (() => new Date());
  const policies = mergePolicies(options.policies);

  return Object.freeze({
    async consume(input: AuthThrottleRequest): Promise<AuthThrottleDecision> {
      const requestTime = readNow(now);
      const scope = validateScope(input.scope);
      const policy = policies[scope];
      const keyHash = deriveAuthThrottleKeyHash({
        secret,
        scope,
        evidence: input.evidence
      });

      try {
        const state = await store.consume({
          scope,
          keyHash,
          now: requestTime,
          policy
        });
        return decisionFromConsumedState(state, policy, requestTime);
      } catch (error) {
        if (error instanceof AuthThrottleError) {
          throw error;
        }
        throw new AuthThrottleError("UNAVAILABLE");
      }
    },

    async inspect(input: AuthThrottleRequest): Promise<AuthThrottleDecision> {
      const requestTime = readNow(now);
      const scope = validateScope(input.scope);
      const policy = policies[scope];
      const keyHash = deriveAuthThrottleKeyHash({
        secret,
        scope,
        evidence: input.evidence
      });

      try {
        const state = await store.inspect(scope, keyHash);
        return decisionFromInspectedState(state, policy, requestTime);
      } catch (error) {
        if (error instanceof AuthThrottleError) {
          throw error;
        }
        throw new AuthThrottleError("UNAVAILABLE");
      }
    }
  });
}

export function deriveAuthThrottleKeyHash(input: Readonly<{
  secret: string;
  scope: AuthThrottleScope;
  evidence: string;
}>) {
  const secret = validateSecret(input.secret);
  const scope = validateScope(input.scope);
  const evidence = normalizeEvidence(scope, input.evidence);
  return createHmac("sha256", secret)
    .update("signalstack-auth-throttle:v1\0", "utf8")
    .update(scope, "utf8")
    .update("\0", "utf8")
    .update(evidence, "utf8")
    .digest("base64url");
}

/**
 * Returns normalized, ephemeral network evidence. Callers should pass it directly to
 * `consume` and must never persist or log it. Forwarded values are ignored unless trust is explicit.
 */
export function extractClientNetwork(input: ClientNetworkInput): string | null {
  if (input.trustForwardedHeaders) {
    const forwarded = parseForwardedFor(input.headers.get("x-forwarded-for"));
    if (forwarded) {
      return forwarded;
    }
  }

  return normalizeNetworkAddress(input.directAddress);
}

function mergePolicies(overrides: AuthThrottlePolicyOverrides | undefined) {
  const result = {} as Record<AuthThrottleScope, AuthThrottlePolicy>;
  for (const scope of Object.values(AuthThrottleScope)) {
    const base = defaultAuthThrottlePolicies[scope];
    const override = overrides?.[scope];
    result[scope] = validatePolicy({
      limit: override?.limit ?? base.limit,
      windowMs: override?.windowMs ?? base.windowMs,
      blockDurationMs: override?.blockDurationMs ?? base.blockDurationMs
    });
  }
  return Object.freeze(result);
}

function validatePolicy(policy: AuthThrottlePolicy): AuthThrottlePolicy {
  if (
    !Number.isSafeInteger(policy.limit) ||
    policy.limit < 1 ||
    policy.limit > MAX_ATTEMPTS ||
    !Number.isSafeInteger(policy.windowMs) ||
    policy.windowMs < SECOND_MS ||
    policy.windowMs > MAX_WINDOW_MS ||
    !Number.isSafeInteger(policy.blockDurationMs) ||
    policy.blockDurationMs < SECOND_MS ||
    policy.blockDurationMs > MAX_BLOCK_DURATION_MS
  ) {
    throw new AuthThrottleError("INVALID_CONFIGURATION");
  }
  return frozenPolicy(policy.limit, policy.windowMs, policy.blockDurationMs);
}

function validateSecret(secret: string) {
  if (
    typeof secret !== "string" ||
    secret.length < MIN_SECRET_CHARACTERS ||
    secret.length > MAX_SECRET_CHARACTERS ||
    Buffer.byteLength(secret, "utf8") > MAX_SECRET_BYTES ||
    hasControlCharacter(secret)
  ) {
    throw new AuthThrottleError("INVALID_CONFIGURATION");
  }
  return secret;
}

function normalizeEvidence(scope: AuthThrottleScope, evidence: string) {
  if (typeof evidence !== "string") {
    throw new AuthThrottleError("INVALID_INPUT");
  }

  switch (scope) {
    case AuthThrottleScope.LOGIN_EMAIL:
    case AuthThrottleScope.RESET_EMAIL:
      return normalizeEmailEvidence(evidence);
    case AuthThrottleScope.LOGIN_NETWORK:
    case AuthThrottleScope.SETUP_NETWORK: {
      const address = normalizeNetworkAddress(evidence);
      if (!address) {
        throw new AuthThrottleError("INVALID_INPUT");
      }
      return address;
    }
  }
}

function normalizeEmailEvidence(evidence: string) {
  const normalized = evidence.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > MAX_EMAIL_CHARACTERS ||
    Buffer.byteLength(normalized, "utf8") > MAX_EMAIL_BYTES ||
    hasControlCharacter(normalized) ||
    !/^[^\s@]+@[^\s@]+$/.test(normalized)
  ) {
    throw new AuthThrottleError("INVALID_INPUT");
  }
  return normalized;
}

function normalizeNetworkAddress(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const version = isIP(normalized);
  if (
    normalized.length === 0 ||
    normalized.length > MAX_NETWORK_CHARACTERS ||
    hasControlCharacter(normalized) ||
    version === 0
  ) {
    return null;
  }
  if (version === 4) {
    return normalized;
  }

  try {
    const hostname = new URL(`http://[${normalized}]/`).hostname;
    return hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : null;
  } catch {
    return null;
  }
}

function parseForwardedFor(value: string | null) {
  if (!value || value.length > MAX_FORWARDED_HEADER_CHARACTERS) {
    return null;
  }
  const hops = value.split(",");
  if (hops.length === 0 || hops.length > MAX_FORWARDED_HOPS) {
    return null;
  }
  const normalized = hops.map((hop) => normalizeNetworkAddress(hop));
  if (normalized.some((hop) => hop === null)) {
    return null;
  }
  return normalized[0];
}

function decisionFromConsumedState(
  state: StoredAuthThrottleState,
  policy: AuthThrottlePolicy,
  now: Date
): AuthThrottleDecision {
  validateStoredState(state);
  const blockedUntil = activeBlockedUntil(state, now);
  const resetAt = blockedUntil ?? addMilliseconds(state.windowStartedAt, policy.windowMs);
  return Object.freeze({
    allowed: blockedUntil === null,
    limit: policy.limit,
    remaining: blockedUntil ? 0 : Math.max(policy.limit - state.attempts, 0),
    resetAt,
    retryAfterSeconds: blockedUntil ? secondsUntil(blockedUntil, now) : 0
  });
}

function decisionFromInspectedState(
  state: StoredAuthThrottleState | null,
  policy: AuthThrottlePolicy,
  now: Date
): AuthThrottleDecision {
  if (!state) {
    return Object.freeze({
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: addMilliseconds(now, policy.windowMs),
      retryAfterSeconds: 0
    });
  }

  validateStoredState(state);
  const windowEndsAt = addMilliseconds(state.windowStartedAt, policy.windowMs);
  const blockedUntil = activeBlockedUntil(state, now);
  if (blockedUntil) {
    return Object.freeze({
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: blockedUntil,
      retryAfterSeconds: secondsUntil(blockedUntil, now)
    });
  }
  if (now.getTime() >= windowEndsAt.getTime()) {
    return Object.freeze({
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: addMilliseconds(now, policy.windowMs),
      retryAfterSeconds: 0
    });
  }

  const allowed = state.attempts < policy.limit;
  const resetAt = allowed
    ? windowEndsAt
    : new Date(Math.max(windowEndsAt.getTime(), now.getTime() + policy.blockDurationMs));
  return Object.freeze({
    allowed,
    limit: policy.limit,
    remaining: allowed ? policy.limit - state.attempts : 0,
    resetAt,
    retryAfterSeconds: allowed ? 0 : secondsUntil(resetAt, now)
  });
}

function validateScope(scope: AuthThrottleScope) {
  if (!authThrottleScopes.has(scope)) {
    throw new AuthThrottleError("INVALID_INPUT");
  }
  return scope;
}

function validateStoredState(state: StoredAuthThrottleState) {
  if (
    !Number.isSafeInteger(state.attempts) ||
    state.attempts < 1 ||
    state.attempts > MAX_ATTEMPTS ||
    !isValidDate(state.windowStartedAt) ||
    (state.blockedUntil !== null && !isValidDate(state.blockedUntil))
  ) {
    throw new AuthThrottleError("UNAVAILABLE");
  }
}

function activeBlockedUntil(state: StoredAuthThrottleState, now: Date) {
  return state.blockedUntil && state.blockedUntil.getTime() > now.getTime()
    ? new Date(state.blockedUntil)
    : null;
}

function readNow(now: () => Date) {
  const value = now();
  if (!isValidDate(value)) {
    throw new AuthThrottleError("INVALID_CONFIGURATION");
  }
  return new Date(value);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function addMilliseconds(value: Date, milliseconds: number) {
  const result = new Date(value.getTime() + milliseconds);
  if (!isValidDate(result)) {
    throw new AuthThrottleError("UNAVAILABLE");
  }
  return result;
}

function secondsUntil(target: Date, now: Date) {
  return Math.max(Math.ceil((target.getTime() - now.getTime()) / SECOND_MS), 1);
}

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

function frozenPolicy(limit: number, windowMs: number, blockDurationMs: number) {
  return Object.freeze({ limit, windowMs, blockDurationMs });
}

function authThrottleErrorMessage(code: AuthThrottleError["code"]) {
  switch (code) {
    case "INVALID_CONFIGURATION":
      return "Authentication throttle configuration is invalid.";
    case "INVALID_INPUT":
      return "Authentication throttle input is invalid.";
    case "UNAVAILABLE":
      return "Authentication throttle is unavailable.";
  }
}
