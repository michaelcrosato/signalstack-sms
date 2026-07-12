import { describe, it, expect } from "vitest";
import { redisConnectionFromUrl } from "@/lib/queue/redis";

describe("redisConnectionFromUrl", () => {
  it("parses a basic redis URL", () => {
    const result = redisConnectionFromUrl("redis://localhost:6379");
    expect(result).toEqual({
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
    });
  });

  it("defaults to port 6379 when not provided", () => {
    const result = redisConnectionFromUrl("redis://localhost");
    expect(result).toEqual({
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
    });
  });

  it("parses a URL with authentication and database", () => {
    const result = redisConnectionFromUrl("redis://testuser:testpass@redis.example.com:6380/2");
    expect(result).toEqual({
      host: "redis.example.com",
      port: 6380,
      username: "testuser",
      password: "testpass",
      db: 2,
    });
  });

  it("parses a URL with just a password", () => {
    const result = redisConnectionFromUrl("redis://:onlypass@127.0.0.1:6379");
    expect(result).toEqual({
      host: "127.0.0.1",
      port: 6379,
      username: undefined,
      password: "onlypass",
      db: undefined,
    });
  });

  it("parses a rediss:// (SSL) URL and enables TLS", () => {
    const result = redisConnectionFromUrl("rediss://aws-redis-host.com:6379/0");
    expect(result).toEqual({
      host: "aws-redis-host.com",
      port: 6379,
      username: undefined,
      password: undefined,
      db: 0,
      tls: {},
    });
  });

  it("percent-decodes credentials containing reserved characters", () => {
    const result = redisConnectionFromUrl("redis://user%40name:p%40ss%3Aword@redis.example.com:6379/0");
    expect(result).toMatchObject({
      username: "user@name",
      password: "p@ss:word",
    });
  });

  it("does not include a tls option for a plaintext redis URL", () => {
    expect(redisConnectionFromUrl("redis://localhost:6379")).not.toHaveProperty("tls");
  });

  it("throws an error for invalid URLs", () => {
    expect(() => redisConnectionFromUrl("not-a-url")).toThrow();
  });
});
