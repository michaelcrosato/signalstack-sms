import { describe, expect, it, vi } from "vitest";
import { checkApiRateLimit, getRedisRateLimitClient } from "@/lib/rate-limit/api-rate-limit";

describe("Redis rate limiting", () => {
  it("creates a Redis client configuration based on environment variables", async () => {
    const client = (await getRedisRateLimitClient({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379"
    })) as { disconnect: () => void } | null;
    expect(client).not.toBeNull();
    client?.disconnect();
  });

  it("returns null if Redis rate limiting is disabled or URL is missing", async () => {
    const client1 = await getRedisRateLimitClient({
      REDIS_RATE_LIMIT_ENABLED: "false",
      REDIS_URL: "redis://localhost:6379"
    });
    expect(client1).toBeNull();

    const client2 = await getRedisRateLimitClient({
      REDIS_RATE_LIMIT_ENABLED: "true"
    });
    expect(client2).toBeNull();
  });

  it("limits requests correctly when Redis transaction is successful", async () => {
    const mockMulti = {
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 1], [null, -1]])
    };
    const mockRedis = {
      multi: vi.fn().mockReturnValue(mockMulti),
      pexpire: vi.fn().mockResolvedValue("OK")
    };

    const policy = { enabled: true, limit: 5, windowMs: 60_000 };
    const result = await checkApiRateLimit({
      key: "client-test",
      policy,
      redis: mockRedis,
      env: { REDIS_RATE_LIMIT_ENABLED: "true", REDIS_URL: "redis://localhost:6379" }
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(mockRedis.multi).toHaveBeenCalled();
    expect(mockRedis.pexpire).toHaveBeenCalledWith("rate_limit:client-test", 60_000);
  });

  it("blocks requests when Redis reports count exceeding policy limit", async () => {
    const mockMulti = {
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 6], [null, 45_000]])
    };
    const mockRedis = {
      multi: vi.fn().mockReturnValue(mockMulti),
      pexpire: vi.fn().mockResolvedValue("OK")
    };

    const policy = { enabled: true, limit: 5, windowMs: 60_000 };
    const result = await checkApiRateLimit({
      key: "client-test",
      policy,
      redis: mockRedis,
      env: { REDIS_RATE_LIMIT_ENABLED: "true", REDIS_URL: "redis://localhost:6379" }
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(45);
  });

  it("gracefully falls back to in-memory rate limiting if Redis exec throws an error", async () => {
    const mockRedis = {
      multi: vi.fn().mockImplementation(() => {
        throw new Error("Redis connection dropped!");
      })
    };

    const policy = { enabled: true, limit: 2, windowMs: 1_000 };
    const localStore = new Map();

    const result = await checkApiRateLimit({
      key: "fallback-key",
      policy,
      store: localStore,
      redis: mockRedis,
      env: { REDIS_RATE_LIMIT_ENABLED: "true", REDIS_URL: "redis://localhost:6379" }
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(localStore.has("fallback-key")).toBe(true);
  });
});
