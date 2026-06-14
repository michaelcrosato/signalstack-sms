import { describe, expect, it, beforeAll } from "vitest";
import { verifyClerkToken, type JwksResponse } from "@/lib/auth/clerk-verifier";
import { webcrypto } from "node:crypto";

const cryptoObj = (globalThis.crypto || webcrypto) as typeof globalThis.crypto;

function bytesToBase64url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function stringToBase64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

describe("verifyClerkToken", () => {
  let privateKey: CryptoKey;
  let jwks: JwksResponse;

  beforeAll(async () => {
    const keyPair = await cryptoObj.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"]
    );

    privateKey = keyPair.privateKey;
    const jwk = await cryptoObj.subtle.exportKey("jwk", keyPair.publicKey);
    (jwk as any).kid = "test-key-id";
    jwks = { keys: [jwk as any] };
  });

  async function createToken(payload: any, kid = "test-key-id") {
    const header = { alg: "RS256", typ: "JWT", kid };
    const headerStr = stringToBase64url(JSON.stringify(header));
    const payloadStr = stringToBase64url(JSON.stringify(payload));
    const data = new TextEncoder().encode(`${headerStr}.${payloadStr}`);
    const signature = await cryptoObj.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
    const signatureStr = bytesToBase64url(new Uint8Array(signature));
    return `${headerStr}.${payloadStr}.${signatureStr}`;
  }

  it("successfully verifies a valid token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://clerk.example.com",
      sub: "user_12345",
      exp: now + 300,
      org_id: "org_67890",
    };

    const token = await createToken(payload);
    const result = await verifyClerkToken(token, { jwks });

    expect(result).toEqual({
      clerkUserId: "user_12345",
      clerkOrgId: "org_67890",
    });
  });

  it("fails to verify an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://clerk.example.com",
      sub: "user_12345",
      exp: now - 60,
    };

    const token = await createToken(payload);
    await expect(verifyClerkToken(token, { jwks })).rejects.toThrow("Token expired");
  });

  it("fails to verify a token that is not yet valid (nbf)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://clerk.example.com",
      sub: "user_12345",
      exp: now + 300,
      nbf: now + 60,
    };

    const token = await createToken(payload);
    await expect(verifyClerkToken(token, { jwks })).rejects.toThrow("Token not yet valid");
  });

  it("fails to verify a token with an invalid issuer", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://wrong.example.com",
      sub: "user_12345",
      exp: now + 300,
    };

    const token = await createToken(payload);
    await expect(
      verifyClerkToken(token, { jwks, expectedIssuer: "https://clerk.example.com" })
    ).rejects.toThrow("Invalid issuer");
  });

  it("fails when signature is invalid", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://clerk.example.com",
      sub: "user_12345",
      exp: now + 300,
    };

    const token = await createToken(payload);
    const parts = token.split(".");
    const tamperedPayload = stringToBase64url(JSON.stringify({ ...payload, sub: "user_hacker" }));
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    await expect(verifyClerkToken(tamperedToken, { jwks })).rejects.toThrow("Invalid signature");
  });

  it("fails if matching kid is not found", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://clerk.example.com",
      sub: "user_12345",
      exp: now + 300,
    };

    const token = await createToken(payload, "wrong-key-id");
    await expect(verifyClerkToken(token, { jwks })).rejects.toThrow("Matching key not found in JWKS");
  });
});
