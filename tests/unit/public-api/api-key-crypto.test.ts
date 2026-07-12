import { describe, expect, it } from "vitest";
import {
  API_KEY_MAX_CHARACTERS,
  generateApiKey,
  hashApiClientAddress,
  hashApiKey,
  parseApiKey,
  parseBearerApiKey,
  readApiKeyPepper
} from "@/lib/public-api/api-key-crypto";

const pepper = "p".repeat(64);

describe("public API key cryptography", () => {
  it("generates a 256-bit one-time secret with a visible non-secret prefix", () => {
    const first = generateApiKey(pepper);
    const second = generateApiKey(pepper);

    expect(first.token).toHaveLength(API_KEY_MAX_CHARACTERS);
    expect(first.prefix).toMatch(/^ss_api_[A-Za-z0-9_-]{12}$/);
    expect(first.token.startsWith(`${first.prefix}_`)).toBe(true);
    expect(first.secretHash).toBe(hashApiKey(first.token, pepper));
    expect(first.token).not.toBe(second.token);
    expect(first.secretHash).not.toBe(second.secretHash);
    expect(first.secretHash).not.toContain(first.token);
  });

  it("parses only the exact bearer grammar", () => {
    const generated = generateApiKey(pepper);

    expect(parseApiKey(generated.token)?.prefix).toBe(generated.prefix);
    expect(parseBearerApiKey(`Bearer ${generated.token}`)?.token).toBe(generated.token);
    expect(parseBearerApiKey(`bearer ${generated.token}`)).toBeNull();
    expect(parseBearerApiKey(`Bearer  ${generated.token}`)).toBeNull();
    expect(parseBearerApiKey(`${generated.token}`)).toBeNull();
    expect(parseApiKey(`${generated.token}x`)).toBeNull();
  });

  it("uses domain-separated keyed digests", () => {
    const generated = generateApiKey(pepper);

    expect(hashApiKey(generated.token, pepper)).not.toBe(hashApiKey(generated.token, "q".repeat(64)));
    expect(hashApiClientAddress("203.0.113.7", pepper)).not.toBe(generated.secretHash);
    expect(hashApiClientAddress("\n", pepper)).toBeNull();
  });

  it("fails closed for missing, weak, or malformed pepper values", () => {
    expect(() => readApiKeyPepper({})).toThrow("unavailable or invalid");
    expect(() => readApiKeyPepper({ API_KEY_PEPPER: "short" })).toThrow("unavailable or invalid");
    expect(() => readApiKeyPepper({ API_KEY_PEPPER: `${"x".repeat(32)}\n` })).toThrow(
      "unavailable or invalid"
    );
  });
});
