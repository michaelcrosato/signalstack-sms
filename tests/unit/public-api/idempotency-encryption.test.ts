import { describe, expect, it } from "vitest";
import {
  decryptIdempotencyResponse,
  encryptIdempotencyResponse
} from "@/lib/public-api/idempotency-encryption";

const environment = { SECRETS_MASTER_KEY: Buffer.alloc(32, 7).toString("base64") };
const binding = {
  orgId: "org-a",
  credentialId: "credential-a",
  keyHash: "key-hash-a",
  method: "POST",
  canonicalRoute: "/api/v1/webhook-endpoints",
  requestHash: "request-hash-a"
} as const;

describe("encrypted idempotency response snapshots", () => {
  it("round-trips an exact response without storing its one-time secret in plaintext", () => {
    const response = { endpoint: { id: "endpoint-a" }, signingSecret: `whsec_${"a".repeat(43)}` };
    const encrypted = encryptIdempotencyResponse(response, binding, environment);
    expect(JSON.stringify(encrypted)).not.toContain(response.signingSecret);
    expect(decryptIdempotencyResponse(encrypted, binding, environment)).toEqual(response);
  });

  it("binds ciphertext to tenant, credential, key, route, method, and request hash", () => {
    const encrypted = encryptIdempotencyResponse({ id: "resource-a" }, binding, environment);
    for (const changed of [
      { ...binding, orgId: "org-b" },
      { ...binding, credentialId: "credential-b" },
      { ...binding, keyHash: "key-hash-b" },
      { ...binding, method: "PATCH" },
      { ...binding, canonicalRoute: "/api/v1/contacts" },
      { ...binding, requestHash: "request-hash-b" }
    ]) {
      expect(() => decryptIdempotencyResponse(encrypted, changed, environment)).toThrow("could not be decrypted");
    }
  });

  it("fails closed for a missing key and tampered envelope", () => {
    expect(() => encryptIdempotencyResponse({ ok: true }, binding, {})).toThrow("unavailable or invalid");
    const encrypted = encryptIdempotencyResponse({ ok: true }, binding, environment);
    expect(() => decryptIdempotencyResponse({ ...encrypted, tag: "a".repeat(22) }, binding, environment)).toThrow();
  });
});
