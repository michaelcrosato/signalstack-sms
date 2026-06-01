import { describe, expect, it } from "vitest";
import { redisConnectionFromUrl, getRedisQueueConfig } from "@/lib/queue/redis";

describe("redis", () => {
  describe("getRedisQueueConfig", () => {
    it("returns REDIS_URL from provided environment object", () => {
      const config = getRedisQueueConfig({ REDIS_URL: "redis://localhost:6379" });
      expect(config.redisUrl).toBe("redis://localhost:6379");
    });

    it("handles missing REDIS_URL", () => {
      const config = getRedisQueueConfig({});
      expect(config.redisUrl).toBeUndefined();
    });
  });

  describe("redisConnectionFromUrl", () => {
    it("parses basic URL with only host", () => {
      const result = redisConnectionFromUrl("redis://localhost");
      expect(result).toEqual({
        host: "localhost",
        port: 6379,
        password: undefined,
        username: undefined,
        db: undefined
      });
    });

    it("parses URL with custom port", () => {
      const result = redisConnectionFromUrl("redis://localhost:6380");
      expect(result).toEqual({
        host: "localhost",
        port: 6380,
        password: undefined,
        username: undefined,
        db: undefined
      });
    });

    it("parses URL with password", () => {
      const result = redisConnectionFromUrl("redis://:secretpass@example.com");
      expect(result).toEqual({
        host: "example.com",
        port: 6379,
        password: "secretpass",
        username: undefined,
        db: undefined
      });
    });

    it("parses URL with username and password", () => {
      const result = redisConnectionFromUrl("redis://user:secretpass@example.com");
      expect(result).toEqual({
        host: "example.com",
        port: 6379,
        password: "secretpass",
        username: "user",
        db: undefined
      });
    });

    it("parses URL with database number", () => {
      const result = redisConnectionFromUrl("redis://localhost/3");
      expect(result).toEqual({
        host: "localhost",
        port: 6379,
        password: undefined,
        username: undefined,
        db: 3
      });
    });

    it("parses full URL with auth, port, and db", () => {
      const result = redisConnectionFromUrl("rediss://admin:supersecret@redis.example.com:1234/15");
      expect(result).toEqual({
        host: "redis.example.com",
        port: 1234,
        password: "supersecret",
        username: "admin",
        db: 15
      });
    });
  });
});
