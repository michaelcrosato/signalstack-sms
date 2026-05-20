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

  it("limits requests within a fixed window and resets after the window", () => {
    const store: RateLimitStore = new Map();
    const policy = { enabled: true, limit: 2, windowMs: 1_000 };

    expect(checkApiRateLimit({ key: "client", policy, now: 10_000, store })).toMatchObject({
      allowed: true,
      remaining: 1
    });
    expect(checkApiRateLimit({ key: "client", policy, now: 10_100, store })).toMatchObject({
      allowed: true,
      remaining: 0
    });

    const blocked = checkApiRateLimit({ key: "client", policy, now: 10_200, store });
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

    expect(checkApiRateLimit({ key: "client", policy, now: 11_001, store })).toMatchObject({
      allowed: true,
      remaining: 1
    });
  });

  it("separates callers by forwarded client address", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-real-ip": "198.51.100.5"
    });

    expect(getApiRateLimitClientKey(headers)).toBe("203.0.113.10");
    expect(getApiRateLimitClientKey(new Headers())).toBe("local-demo-client");
  });
});
