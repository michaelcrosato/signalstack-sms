import { describe, expect, it } from "vitest";
import { getRedisQueueConfig, redisConnectionFromUrl } from "@/lib/queue/redis";

describe("Redis queue configuration", () => {
  describe("getRedisQueueConfig", () => {
    it("returns config with REDIS_URL from provided env", () => {
      const config = getRedisQueueConfig({ REDIS_URL: "redis://localhost:6379" });
      expect(config).toEqual({ redisUrl: "redis://localhost:6379" });
    });

    it("returns config with undefined redisUrl if not in env", () => {
      const config = getRedisQueueConfig({});
      expect(config).toEqual({ redisUrl: undefined });
    });

    it("defaults to process.env if no env object is provided", () => {
      // Store original REDIS_URL
      const originalRedisUrl = process.env.REDIS_URL;
      try {
        // Set a specific value for the test
        process.env.REDIS_URL = "redis://test-fallback:6379";
        const config = getRedisQueueConfig();
        expect(config).toEqual({ redisUrl: "redis://test-fallback:6379" });
      } finally {
        // Restore original REDIS_URL
        if (originalRedisUrl === undefined) {
            delete process.env.REDIS_URL;
        } else {
            process.env.REDIS_URL = originalRedisUrl;
        }
      }
    });
  });

  describe("redisConnectionFromUrl", () => {
    it("parses Redis URL connection settings without exposing credentials", () => {
      expect(redisConnectionFromUrl("redis://worker:secret@localhost:6380/2")).toEqual({
        host: "localhost",
        port: 6380,
        username: "worker",
        password: "secret",
        db: 2
      });
    });

    it("parses minimal Redis URL using defaults", () => {
      expect(redisConnectionFromUrl("redis://localhost")).toEqual({
        host: "localhost",
        port: 6379,
        username: undefined,
        password: undefined,
        db: undefined
      });
    });
  });
});
