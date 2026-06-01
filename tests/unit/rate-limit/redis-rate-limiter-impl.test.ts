import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getRedisRateLimitClientImpl } from "@/lib/rate-limit/redis-rate-limiter-impl";
import Redis from "ioredis";
import { logger } from "@/lib/rate-limit/api-rate-limit";

vi.mock("ioredis");
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("getRedisRateLimitClientImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset internal state
    getRedisRateLimitClientImpl({ REDIS_RATE_LIMIT_ENABLED: "false" });
  });

  it("returns null when REDIS_RATE_LIMIT_ENABLED is not true", () => {
    const client = getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "false",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(client).toBeNull();
  });

  it("returns null when REDIS_URL is not provided", () => {
    const client = getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
    });
    expect(client).toBeNull();
  });

  it("creates a new Redis client when enabled and URL is provided", () => {
    const client = getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(client).toBeDefined();
    expect(Redis).toHaveBeenCalledWith("redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  });

  it("returns the same Redis client if called again with the same URL", () => {
    const client1 = getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379",
    });

    const client2 = getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(client1).toBe(client2);
    expect(Redis).toHaveBeenCalledTimes(1);
  });

  it("disconnects the old client and creates a new one if URL changes", () => {
    const disconnectMock = vi.fn();
    vi.mocked(Redis).mockImplementationOnce(() => {
      return { disconnect: disconnectMock, on: vi.fn() } as unknown as Redis;
    });

    getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379",
    });

    getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://otherhost:6379",
    });

    expect(disconnectMock).toHaveBeenCalled();
    expect(Redis).toHaveBeenCalledTimes(2);
  });

  it("disconnects the client if disabled after being enabled", () => {
    const disconnectMock = vi.fn();
    vi.mocked(Redis).mockImplementationOnce(() => {
      return { disconnect: disconnectMock, on: vi.fn() } as unknown as Redis;
    });

    getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379",
    });

    const client = getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "false",
    });

    expect(disconnectMock).toHaveBeenCalled();
    expect(client).toBeNull();
  });

  it("catches errors during initialization and logs a warning", () => {
    vi.mocked(Redis).mockImplementationOnce(() => {
      throw new Error("Initialization failed");
    });

    const client = getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(client).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith("redis_rate_limit_client_init_failed", { error: "Initialization failed" });
  });

  it("attaches an error listener that logs warnings", () => {
    const onMock = vi.fn();
    vi.mocked(Redis).mockImplementationOnce(() => {
      return { disconnect: vi.fn(), on: onMock } as unknown as Redis;
    });

    getRedisRateLimitClientImpl({
      REDIS_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));

    const errorHandler = onMock.mock.calls[0][1];
    errorHandler(new Error("Redis error"));

    expect(logger.warn).toHaveBeenCalledWith("redis_rate_limit_client_error", { error: "Redis error" });
  });
});
