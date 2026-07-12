import { describe, expect, it } from "vitest";
import {
  apiRateLimitHeaders,
  checkApiRateLimit,
  getApiRateLimitClientKey,
  getApiRateLimitPolicy,
  type RateLimitStore
} from "@/lib/rate-limit/api-rate-limit";

describe("API rate limiting", () => {
  it("uses demo-safe defaults and clamps env overrides", () => {
    expect(getApiRateLimitPolicy({})).toEqual({
      enabled: true,
      limit: 120,
      windowMs: 60_000
    });

    expect(
      getApiRateLimitPolicy({
        API_RATE_LIMIT_ENABLED: "false",
        API_RATE_LIMIT_MAX: "0",
        API_RATE_LIMIT_WINDOW_MS: "999999999"
      })
    ).toEqual({
      enabled: false,
      limit: 1,
      windowMs: 3_600_000
    });
  });

  it("limits requests within a fixed window and resets after the window", async () => {
    const store: RateLimitStore = new Map();
    const policy = { enabled: true, limit: 2, windowMs: 1_000 };

    expect(await checkApiRateLimit({ key: "client", policy, now: 10_000, store })).toMatchObject({
      allowed: true,
      remaining: 1
    });
    expect(await checkApiRateLimit({ key: "client", policy, now: 10_100, store })).toMatchObject({
      allowed: true,
      remaining: 0
    });

    const blocked = await checkApiRateLimit({ key: "client", policy, now: 10_200, store });
    expect(blocked).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1
    });
    expect(apiRateLimitHeaders(blocked)).toMatchObject({
      "RateLimit-Limit": "2",
      "RateLimit-Remaining": "0",
      "Retry-After": "1"
    });

    expect(await checkApiRateLimit({ key: "client", policy, now: 11_001, store })).toMatchObject({
      allowed: true,
      remaining: 1
    });
  });

  const trustedProxy = { TRUST_PROXY: "true" };

  it("always trusts a platform-provided socket address regardless of TRUST_PROXY", () => {
    expect(
      getApiRateLimitClientKey(
        {
          headers: new Headers({
            "cf-connecting-ip": "1.1.1.1",
            "x-real-ip": "2.2.2.2",
            "x-forwarded-for": "3.3.3.3, 4.4.4.4"
          }),
          ip: "5.5.5.5"
        },
        {}
      )
    ).toBe("5.5.5.5");
  });

  it("resolves forwarded IP headers by priority only when behind a trusted proxy", () => {
    // Priority: cf-connecting-ip
    expect(
      getApiRateLimitClientKey(
        {
          headers: new Headers({
            "cf-connecting-ip": "1.1.1.1",
            "x-real-ip": "2.2.2.2",
            "x-forwarded-for": "3.3.3.3, 4.4.4.4"
          })
        },
        trustedProxy
      )
    ).toBe("1.1.1.1");

    // Priority: x-real-ip
    expect(
      getApiRateLimitClientKey(
        { headers: new Headers({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3, 4.4.4.4" }) },
        trustedProxy
      )
    ).toBe("2.2.2.2");

    // Priority: rightmost x-forwarded-for (the hop our trusted ingress observed)
    expect(
      getApiRateLimitClientKey({ headers: new Headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }) }, trustedProxy)
    ).toBe("4.4.4.4");
  });

  it("ignores spoofable forwarded headers without TRUST_PROXY (no per-request bucket bypass)", () => {
    // Every attacker-supplied header collapses to the shared bucket, so rotating fake IPs cannot mint
    // a fresh limiter bucket per request.
    expect(
      getApiRateLimitClientKey(
        { headers: new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }) },
        {}
      )
    ).toBe("local-demo-client");
    expect(
      getApiRateLimitClientKey({ headers: new Headers({ "cf-connecting-ip": "2.2.2.2" }) }, {})
    ).toBe("local-demo-client");
  });

  it("falls back to the shared key when no address is available", () => {
    expect(getApiRateLimitClientKey(new Headers(), trustedProxy)).toBe("local-demo-client");
    expect(getApiRateLimitClientKey(new Headers(), {})).toBe("local-demo-client");
  });
});
