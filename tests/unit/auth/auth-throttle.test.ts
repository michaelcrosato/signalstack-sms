import { AuthThrottleScope } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  createAuthThrottleService,
  deriveAuthThrottleKeyHash,
  extractClientNetwork,
  type AuthThrottlePolicy,
  type AuthThrottleStore,
  type ConsumeStoredAuthThrottleInput,
  type StoredAuthThrottleState
} from "@/lib/auth/auth-throttle";

const SECRET = "test-only-auth-throttle-secret-0123456789abcdef";
const BASE_TIME = new Date("2026-07-11T02:00:00.000Z");
const EMAIL = "Owner@Example.TEST";

class AtomicMemoryThrottleStore implements AuthThrottleStore {
  readonly states = new Map<string, StoredAuthThrottleState>();

  async consume(input: ConsumeStoredAuthThrottleInput) {
    const storageKey = `${input.scope}:${input.keyHash}`;
    const existing = this.states.get(storageKey);
    const next = consumeState(existing, input.now, input.policy);
    this.states.set(storageKey, next);
    return copyState(next);
  }

  async inspect(scope: AuthThrottleScope, keyHash: string) {
    const state = this.states.get(`${scope}:${keyHash}`);
    return state ? copyState(state) : null;
  }
}

describe("database-backed authentication throttle", () => {
  it("allows the first attempts through the limit and gives a bounded retry after the next attempt", async () => {
    const store = new AtomicMemoryThrottleStore();
    let now = new Date(BASE_TIME);
    const service = createService(store, () => now, {
      limit: 2,
      windowMs: 1_000,
      blockDurationMs: 2_000
    });

    await expect(service.consume(loginEmailRequest())).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 0
    });

    now = new Date(BASE_TIME.getTime() + 100);
    await expect(service.consume(loginEmailRequest())).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0
    });

    now = new Date(BASE_TIME.getTime() + 200);
    const blocked = await service.consume(loginEmailRequest());
    expect(blocked).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 2
    });
    expect(blocked.resetAt).toEqual(new Date(BASE_TIME.getTime() + 2_200));

    now = new Date(BASE_TIME.getTime() + 300);
    await expect(service.inspect(loginEmailRequest())).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 2
    });
  });

  it("starts a fresh fixed window only after the longer active block rolls over", async () => {
    const store = new AtomicMemoryThrottleStore();
    let now = new Date(BASE_TIME);
    const service = createService(store, () => now, {
      limit: 1,
      windowMs: 1_000,
      blockDurationMs: 2_000
    });

    await expect(service.consume(loginEmailRequest())).resolves.toMatchObject({ allowed: true, remaining: 0 });
    now = new Date(BASE_TIME.getTime() + 100);
    await expect(service.consume(loginEmailRequest())).resolves.toMatchObject({ allowed: false });

    now = new Date(BASE_TIME.getTime() + 2_099);
    await expect(service.consume(loginEmailRequest())).resolves.toMatchObject({ allowed: false });

    now = new Date(BASE_TIME.getTime() + 2_100);
    await expect(service.consume(loginEmailRequest())).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0
    });
  });

  it("serializes concurrent consumes so no more than the configured limit is allowed", async () => {
    const store = new AtomicMemoryThrottleStore();
    const service = createService(store, () => BASE_TIME, {
      limit: 4,
      windowMs: 60_000,
      blockDurationMs: 60_000
    });

    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => service.consume(loginEmailRequest()))
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(4);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(16);
    expect([...store.states.values()][0]).toMatchObject({ attempts: 4 });
  });

  it("derives deterministic, scope-separated HMAC keys without exposing evidence to storage or results", async () => {
    const normalized = "owner@example.test";
    const first = deriveAuthThrottleKeyHash({
      secret: SECRET,
      scope: AuthThrottleScope.LOGIN_EMAIL,
      evidence: EMAIL
    });
    const second = deriveAuthThrottleKeyHash({
      secret: SECRET,
      scope: AuthThrottleScope.LOGIN_EMAIL,
      evidence: normalized
    });
    const otherScope = deriveAuthThrottleKeyHash({
      secret: SECRET,
      scope: AuthThrottleScope.RESET_EMAIL,
      evidence: normalized
    });
    const otherSecret = deriveAuthThrottleKeyHash({
      secret: `${SECRET}-different`,
      scope: AuthThrottleScope.LOGIN_EMAIL,
      evidence: normalized
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(43);
    expect(first).not.toContain(normalized);
    expect(first).not.toBe(otherScope);
    expect(first).not.toBe(otherSecret);
    expect(
      deriveAuthThrottleKeyHash({
        secret: SECRET,
        scope: AuthThrottleScope.LOGIN_NETWORK,
        evidence: "2001:0DB8:0000:0000:0000:0000:0000:0001"
      })
    ).toBe(
      deriveAuthThrottleKeyHash({
        secret: SECRET,
        scope: AuthThrottleScope.LOGIN_NETWORK,
        evidence: "2001:db8::1"
      })
    );

    const store = new AtomicMemoryThrottleStore();
    const service = createService(store, () => BASE_TIME);
    const decision = await service.consume(loginEmailRequest());
    const serializedStorage = JSON.stringify([...store.states.entries()]);
    expect(serializedStorage).not.toContain(normalized);
    expect(serializedStorage).not.toContain(EMAIL);
    expect(JSON.stringify(decision)).not.toContain(normalized);
    expect(decision).not.toHaveProperty("keyHash");
  });

  it("uses forwarded network evidence only under explicit proxy trust", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.2",
      "x-real-ip": "203.0.113.8",
      "cf-connecting-ip": "203.0.113.9"
    });

    expect(
      extractClientNetwork({
        headers,
        directAddress: "198.51.100.4",
        trustForwardedHeaders: false
      })
    ).toBe("198.51.100.4");
    expect(
      extractClientNetwork({ headers, trustForwardedHeaders: false })
    ).toBeNull();
    expect(
      extractClientNetwork({
        headers,
        directAddress: "198.51.100.4",
        trustForwardedHeaders: true
      })
    ).toBe("203.0.113.7");

    const unsupportedForwardedHeaders = new Headers({
      "x-real-ip": "203.0.113.8",
      "cf-connecting-ip": "203.0.113.9"
    });
    expect(
      extractClientNetwork({
        headers: unsupportedForwardedHeaders,
        directAddress: "198.51.100.4",
        trustForwardedHeaders: true
      })
    ).toBe("198.51.100.4");
    expect(
      extractClientNetwork({
        headers: unsupportedForwardedHeaders,
        trustForwardedHeaders: true
      })
    ).toBeNull();
  });

  it("rejects malformed and oversized evidence, proxy chains, secrets, policies, and clocks", async () => {
    expect(() => createAuthThrottleService({ secret: "too-short" })).toThrow(
      "Authentication throttle configuration is invalid."
    );
    expect(() =>
      createService(new AtomicMemoryThrottleStore(), () => BASE_TIME, {
        limit: 0,
        windowMs: 999,
        blockDurationMs: 999
      })
    ).toThrow("Authentication throttle configuration is invalid.");

    const service = createService(new AtomicMemoryThrottleStore(), () => BASE_TIME);
    await expect(
      service.consume({ scope: AuthThrottleScope.LOGIN_EMAIL, evidence: "not-an-email" })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      service.consume({ scope: AuthThrottleScope.LOGIN_EMAIL, evidence: `owner@example.test\u0000` })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      service.consume({ scope: AuthThrottleScope.LOGIN_EMAIL, evidence: `${"a".repeat(321)}@x.test` })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      service.consume({ scope: AuthThrottleScope.LOGIN_NETWORK, evidence: "203.0.113.7:443" })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      service.consume({
        scope: "UNKNOWN_SCOPE" as AuthThrottleScope,
        evidence: EMAIL
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(
      extractClientNetwork({
        headers: new Headers({ "x-forwarded-for": "203.0.113.7, malformed" }),
        trustForwardedHeaders: true
      })
    ).toBeNull();
    expect(
      extractClientNetwork({
        headers: new Headers({ "x-forwarded-for": Array(17).fill("203.0.113.7").join(",") }),
        trustForwardedHeaders: true
      })
    ).toBeNull();

    const invalidClock = createService(new AtomicMemoryThrottleStore(), () => new Date("invalid"));
    await expect(invalidClock.consume(loginEmailRequest())).rejects.toMatchObject({
      code: "INVALID_CONFIGURATION"
    });
  });

  it("sanitizes persistence failures without echoing store details or raw evidence", async () => {
    const store: AuthThrottleStore = {
      async consume() {
        throw new Error(`database rejected ${EMAIL}`);
      },
      async inspect() {
        throw new Error(`database rejected ${EMAIL}`);
      }
    };
    const service = createService(store, () => BASE_TIME);

    for (const operation of [service.consume(loginEmailRequest()), service.inspect(loginEmailRequest())]) {
      await expect(operation).rejects.toEqual(
        expect.objectContaining({
          code: "UNAVAILABLE",
          message: "Authentication throttle is unavailable."
        })
      );
      await expect(operation).rejects.not.toThrow(EMAIL);
    }
  });
});

function createService(
  store: AuthThrottleStore,
  now: () => Date,
  loginEmailPolicy: AuthThrottlePolicy = {
    limit: 5,
    windowMs: 60_000,
    blockDurationMs: 60_000
  }
) {
  return createAuthThrottleService({
    secret: SECRET,
    store,
    now,
    policies: { [AuthThrottleScope.LOGIN_EMAIL]: loginEmailPolicy }
  });
}

function loginEmailRequest() {
  return { scope: AuthThrottleScope.LOGIN_EMAIL, evidence: EMAIL } as const;
}

function consumeState(
  existing: StoredAuthThrottleState | undefined,
  now: Date,
  policy: AuthThrottlePolicy
): StoredAuthThrottleState {
  if (!existing) {
    return { attempts: 1, windowStartedAt: new Date(now), blockedUntil: null };
  }
  if (existing.blockedUntil && existing.blockedUntil.getTime() > now.getTime()) {
    return copyState(existing);
  }

  const windowEndsAt = existing.windowStartedAt.getTime() + policy.windowMs;
  if (now.getTime() >= windowEndsAt) {
    return { attempts: 1, windowStartedAt: new Date(now), blockedUntil: null };
  }
  if (existing.attempts >= policy.limit) {
    return {
      attempts: existing.attempts,
      windowStartedAt: new Date(existing.windowStartedAt),
      blockedUntil: new Date(
        Math.max(windowEndsAt, now.getTime() + policy.blockDurationMs)
      )
    };
  }
  return {
    attempts: existing.attempts + 1,
    windowStartedAt: new Date(existing.windowStartedAt),
    blockedUntil: null
  };
}

function copyState(state: StoredAuthThrottleState): StoredAuthThrottleState {
  return {
    attempts: state.attempts,
    windowStartedAt: new Date(state.windowStartedAt),
    blockedUntil: state.blockedUntil ? new Date(state.blockedUntil) : null
  };
}
