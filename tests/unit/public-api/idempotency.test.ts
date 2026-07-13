import { describe, expect, it } from "vitest";
import {
  PublicApiIdempotencyError,
  canonicalizePublicApiJson,
  hashIdempotencyKey,
  hashIdempotentRequest,
  requireIdempotencyKey
} from "@/lib/public-api/idempotency";

const pepper = "p".repeat(64);

describe("public API idempotency", () => {
  it("canonicalizes semantically identical JSON objects identically", () => {
    expect(canonicalizePublicApiJson({ z: 1, a: { y: true, x: [2, 1] } })).toBe(
      canonicalizePublicApiJson({ a: { x: [2, 1], y: true }, z: 1 })
    );
    expect(
      hashIdempotentRequest("post", "/api/v1/contacts", { phone: "+15551234567", x: 1 }, pepper)
    ).toBe(
      hashIdempotentRequest("POST", "/api/v1/contacts", { x: 1, phone: "+15551234567" }, pepper)
    );
  });

  it("binds request fingerprints to method, canonical route, and body", () => {
    const base = hashIdempotentRequest("POST", "/api/v1/contacts", { phone: "+15551234567" }, pepper);
    expect(hashIdempotentRequest("PATCH", "/api/v1/contacts", { phone: "+15551234567" }, pepper)).not.toBe(base);
    expect(hashIdempotentRequest("POST", "/api/v1/messages", { phone: "+15551234567" }, pepper)).not.toBe(base);
    expect(hashIdempotentRequest("POST", "/api/v1/contacts", { phone: "+15557654321" }, pepper)).not.toBe(base);
  });

  it("stores a keyed digest instead of the caller's idempotency token", () => {
    const key = "contact-create:request-0001";
    const digest = hashIdempotencyKey(key, pepper);
    expect(digest).not.toContain(key);
    expect(digest).not.toBe(hashIdempotencyKey(key, "q".repeat(64)));
  });

  it("rejects absent and unsafe idempotency key shapes", () => {
    for (const value of [null, "short", "contains a space", "x".repeat(129)]) {
      expect(() => requireIdempotencyKey(value)).toThrow(PublicApiIdempotencyError);
    }
    expect(requireIdempotencyKey("safe-key:1234")).toBe("safe-key:1234");
  });

  it("rejects cyclic and non-JSON input", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizePublicApiJson(cyclic)).toThrow("cycle");
    expect(() => canonicalizePublicApiJson({ value: Number.NaN })).toThrow("non-finite");
    expect(() => canonicalizePublicApiJson({ value: BigInt(1) })).toThrow("JSON-compatible");
  });
});
