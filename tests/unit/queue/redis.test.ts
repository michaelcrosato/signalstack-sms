import { describe, expect, it, vi, afterEach } from "vitest";
import { getRedisQueueConfig, redisConnectionFromUrl } from "@/lib/queue/redis";

describe("redis", () => {
  describe("getRedisQueueConfig", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should return redisUrl from provided env", () => {
      const env = { REDIS_URL: "redis://localhost:6379" };
      const config = getRedisQueueConfig(env);
      expect(config.redisUrl).toBe("redis://localhost:6379");
    });

    it("should return undefined if REDIS_URL is not set", () => {
      const env = {};
      const config = getRedisQueueConfig(env);
      expect(config.redisUrl).toBeUndefined();
    });

    it("should fallback to process.env if env is not provided", () => {
      vi.stubEnv("REDIS_URL", "redis://fallback:6379");
      const config = getRedisQueueConfig();
      expect(config.redisUrl).toBe("redis://fallback:6379");
    });
  });

  describe("redisConnectionFromUrl", () => {
    it("should parse a basic redis url", () => {
      const connection = redisConnectionFromUrl("redis://localhost:6379");
      expect(connection).toEqual({
        host: "localhost",
        port: 6379,
        password: undefined,
        username: undefined,
        db: undefined,
      });
    });

    it("should default to port 6379 if not provided", () => {
      const connection = redisConnectionFromUrl("redis://localhost");
      expect(connection).toEqual({
        host: "localhost",
        port: 6379,
        password: undefined,
        username: undefined,
        db: undefined,
      });
    });

    it("should parse a redis url with username and password", () => {
      const connection = redisConnectionFromUrl(
        "redis://user:pass@localhost:6379",
      );
      expect(connection).toEqual({
        host: "localhost",
        port: 6379,
        password: "pass",
        username: "user",
        db: undefined,
      });
    });

    it("should parse a redis url with db index", () => {
      const connection = redisConnectionFromUrl("redis://localhost:6379/1");
      expect(connection).toEqual({
        host: "localhost",
        port: 6379,
        password: undefined,
        username: undefined,
        db: 1,
      });
    });

    it("should parse a complex redis url", () => {
      const connection = redisConnectionFromUrl(
        "rediss://my-user:my-password@my-host.com:6380/5",
      );
      expect(connection).toEqual({
        host: "my-host.com",
        port: 6380,
        password: "my-password",
        username: "my-user",
        db: 5,
      });
    });
  });
});
