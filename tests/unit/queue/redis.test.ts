import { describe, it, expect, vi, afterEach } from "vitest";
import { getRedisQueueConfig, redisConnectionFromUrl } from "@/lib/queue/redis";

describe("redis configuration", () => {
  describe("getRedisQueueConfig", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should return redisUrl from provided environment object", () => {
      const mockEnv = { REDIS_URL: "redis://localhost:6379" };
      const config = getRedisQueueConfig(mockEnv);

      expect(config).toEqual({
        redisUrl: "redis://localhost:6379"
      });
    });

    it("should return undefined redisUrl if REDIS_URL is not set", () => {
      const mockEnv = {};
      const config = getRedisQueueConfig(mockEnv);

      expect(config).toEqual({
        redisUrl: undefined
      });
    });

    it("should default to process.env if no arguments are provided", () => {
      vi.stubEnv("REDIS_URL", "redis://test.local:1234");

      const config = getRedisQueueConfig();

      expect(config).toEqual({
        redisUrl: "redis://test.local:1234"
      });
    });
  });

  describe("redisConnectionFromUrl", () => {
    it("should parse a complete redis URL", () => {
      const url = "redis://username:password@redis.host.com:6380/5";
      const connection = redisConnectionFromUrl(url);

      expect(connection).toEqual({
        host: "redis.host.com",
        port: 6380,
        password: "password",
        username: "username",
        db: 5
      });
    });

    it("should parse a basic redis URL and apply defaults", () => {
      const url = "redis://localhost";
      const connection = redisConnectionFromUrl(url);

      expect(connection).toEqual({
        host: "localhost",
        port: 6379,
        password: undefined,
        username: undefined,
        db: undefined
      });
    });

    it("should parse a URL with only password", () => {
      // In URL specification, no username with password looks like :password@host
      const url = "redis://:mypassword@localhost:6379/0";
      const connection = redisConnectionFromUrl(url);

      expect(connection).toEqual({
        host: "localhost",
        port: 6379,
        password: "mypassword",
        username: undefined,
        db: 0
      });
    });

    it("should handle rediss:// (secure redis) URLs", () => {
      const url = "rediss://secure.host.com:6379";
      const connection = redisConnectionFromUrl(url);

      expect(connection).toEqual({
        host: "secure.host.com",
        port: 6379,
        password: undefined,
        username: undefined,
        db: undefined
      });
    });
  });
});
