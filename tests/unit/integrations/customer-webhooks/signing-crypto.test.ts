import { describe, expect, it } from "vitest";
import {
  createCustomerWebhookSigningSecret,
  decryptCustomerWebhookSigningSecret,
  encryptCustomerWebhookSigningSecret,
  fingerprintCustomerWebhookSigningSecret,
  parseCustomerWebhookSecretsMasterKey,
  readCustomerWebhookSecretsMasterKey
} from "@/lib/integrations/customer-webhooks/signing-secrets";
import {
  signCustomerWebhookPayload,
  verifyCustomerWebhookSignature
} from "@/lib/integrations/customer-webhooks/signatures";

const masterKey = Buffer.from(Array.from({ length: 32 }, (_, index) => 255 - index));
const binding = Object.freeze({
  orgId: "org_01",
  endpointId: "endpoint_01",
  subscriptionId: "subscription_01",
  secretId: "secret_01",
  secretVersion: 3
});
const goldenSecret = "whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

describe("customer webhook signing-secret envelopes", () => {
  it("reveals a 256-bit secret once and stores only an authenticated envelope plus fingerprint", () => {
    const randomValues = [Buffer.alloc(32, 0xa5), Buffer.alloc(12, 0x3c)];
    const created = createCustomerWebhookSigningSecret({
      masterKey,
      keyVersion: 7,
      binding,
      dependencies: {
        randomBytes(size) {
          const value = randomValues.shift();
          expect(value).toHaveLength(size);
          return value!;
        }
      }
    });

    expect(created.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(created.envelope).toMatchObject({
      envelopeVersion: 1,
      algorithm: "aes-256-gcm",
      keyVersion: 7,
      fingerprint: fingerprintCustomerWebhookSigningSecret(created.secret)
    });
    expect(JSON.stringify(created.envelope)).not.toContain(created.secret);
    expect(decryptCustomerWebhookSigningSecret({ envelope: created.envelope, masterKey, binding })).toBe(
      created.secret
    );
  });

  it.each([
    ["org", { ...binding, orgId: "org_02" }],
    ["endpoint", { ...binding, endpointId: "endpoint_02" }],
    ["subscription", { ...binding, subscriptionId: "subscription_02" }],
    ["secret", { ...binding, secretId: "secret_02" }],
    ["version", { ...binding, secretVersion: 4 }]
  ])("binds the envelope AAD to %s identity", (_label, changedBinding) => {
    const envelope = encryptCustomerWebhookSigningSecret({
      secret: goldenSecret,
      masterKey,
      keyVersion: 2,
      binding,
      dependencies: { randomBytes: () => Buffer.alloc(12, 0x11) }
    });

    expect(() =>
      decryptCustomerWebhookSigningSecret({ envelope, masterKey, binding: changedBinding })
    ).toThrow("could not be decrypted");
  });

  it("fails closed on ciphertext, tag, fingerprint, key-version, or master-key tampering", () => {
    const envelope = encryptCustomerWebhookSigningSecret({
      secret: goldenSecret,
      masterKey,
      keyVersion: 2,
      binding,
      dependencies: { randomBytes: () => Buffer.alloc(12, 0x22) }
    });
    const variants = [
      { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -1)}A` },
      { ...envelope, authTag: `${envelope.authTag.slice(0, -1)}A` },
      { ...envelope, fingerprint: "whfp_AAAAAAAAAAAAAAAAAAAAAA" },
      { ...envelope, keyVersion: 3 }
    ];

    for (const tampered of variants) {
      expect(() => decryptCustomerWebhookSigningSecret({ envelope: tampered, masterKey, binding })).toThrow(
        /invalid|could not be decrypted/
      );
    }
    expect(() =>
      decryptCustomerWebhookSigningSecret({ envelope, masterKey: Buffer.alloc(32, 0xff), binding })
    ).toThrow("could not be decrypted");
  });

  it("lazily accepts exact 256-bit hex/base64 master keys and rejects malformed environment state", () => {
    expect(parseCustomerWebhookSecretsMasterKey(masterKey.toString("hex"))).toEqual(masterKey);
    expect(parseCustomerWebhookSecretsMasterKey(masterKey.toString("base64"))).toEqual(masterKey);
    expect(readCustomerWebhookSecretsMasterKey({ SECRETS_MASTER_KEY: masterKey.toString("base64") })).toEqual(
      masterKey
    );
    expect(() => readCustomerWebhookSecretsMasterKey({})).toThrow("unavailable or invalid");
    expect(() => readCustomerWebhookSecretsMasterKey({ SECRETS_MASTER_KEY: `${"a".repeat(64)}\n` })).toThrow(
      "unavailable or invalid"
    );
  });
});

describe("customer webhook raw-body signatures", () => {
  it("matches the frozen HMAC-SHA256 golden vector over the exact UTF-8 body bytes", () => {
    const rawBody = Buffer.from('{"id":"evt_123","message":"café"}\n', "utf8");
    const signature = signCustomerWebhookPayload({
      secret: goldenSecret,
      timestampSeconds: 1_710_000_000,
      rawBody
    });

    expect(signature).toBe("v1=34e08c1c856800bd8989e596674b931cc38846e5eddcd9c84768baefd2ad381e");
    expect(
      verifyCustomerWebhookSignature({
        secret: goldenSecret,
        timestampHeader: "1710000000",
        signatureHeader: signature,
        rawBody,
        nowSeconds: 1_710_000_120
      })
    ).toBe(true);
  });

  it("rejects reserialized bodies, malformed signatures, wrong secrets, and stale or future timestamps", () => {
    const rawBody = Buffer.from('{"a":1,"b":2}', "utf8");
    const signature = signCustomerWebhookPayload({
      secret: goldenSecret,
      timestampSeconds: 1_710_000_000,
      rawBody
    });
    const base = {
      secret: goldenSecret,
      timestampHeader: "1710000000",
      signatureHeader: signature,
      rawBody,
      nowSeconds: 1_710_000_000
    };

    expect(verifyCustomerWebhookSignature({ ...base, rawBody: Buffer.from('{"b":2,"a":1}') })).toBe(false);
    expect(verifyCustomerWebhookSignature({ ...base, signatureHeader: `v1=${"A".repeat(64)}` })).toBe(false);
    expect(verifyCustomerWebhookSignature({ ...base, signatureHeader: "garbage" })).toBe(false);
    expect(
      verifyCustomerWebhookSignature({
        ...base,
        secret: `whsec_${Buffer.alloc(32, 0xff).toString("base64url")}`
      })
    ).toBe(false);
    expect(verifyCustomerWebhookSignature({ ...base, nowSeconds: 1_710_000_301 })).toBe(false);
    expect(verifyCustomerWebhookSignature({ ...base, nowSeconds: 1_709_999_699 })).toBe(false);
    expect(verifyCustomerWebhookSignature({ ...base, timestampHeader: "01710000000" })).toBe(false);
  });
});
