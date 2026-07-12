import { describe, expect, it } from "vitest";
import {
  createProviderDiscoveryCandidateId,
  createProviderCredentialEnvelope,
  decryptProviderCredentialEnvelope,
  hashProviderLookupIdentifier,
  parseProviderCredentialMasterKey,
  type ProviderCredentialEnvelope,
  type ProviderCredentialEnvelopeBinding
} from "@/lib/integrations/provider-accounts/credential-encryption";

const masterKey = "11".repeat(32);
const otherMasterKey = "22".repeat(32);
const secret = "abcdef0123456789abcdef0123456789";
const binding: ProviderCredentialEnvelopeBinding = Object.freeze({
  orgId: "org_1",
  provider: "twilio",
  externalAccountId: `AC${"a".repeat(32)}`,
  externalAccountIdHash: `pvlookup_v1_${"A".repeat(43)}`,
  providerAccountId: "provider_account_1",
  secretId: "provider_secret_1",
  credentialVersion: 3
});

function createEnvelope() {
  return createProviderCredentialEnvelope({
    secret,
    masterKey,
    keyVersion: 7,
    binding,
    dependencies: { randomBytes: (size) => Buffer.alloc(size, 5) }
  });
}

describe("provider credential encryption", () => {
  it("round-trips an opaque AES-256-GCM credential without serializing plaintext", () => {
    const envelope = createEnvelope();

    expect(envelope).toEqual({
      envelopeVersion: 1,
      algorithm: "aes-256-gcm",
      keyVersion: 7,
      iv: Buffer.alloc(12, 5).toString("base64url"),
      ciphertext: expect.any(String),
      authTag: expect.any(String),
      fingerprint: expect.stringMatching(/^pvfp_[A-Za-z0-9_-]{22}$/)
    });
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(decryptProviderCredentialEnvelope({ envelope, masterKey, binding })).toBe(secret);
  });

  it.each([
    ["orgId", "org_2"],
    ["provider", "other"],
    ["externalAccountId", `AC${"b".repeat(32)}`],
    ["externalAccountIdHash", `pvlookup_v1_${"B".repeat(43)}`],
    ["providerAccountId", "provider_account_2"],
    ["secretId", "provider_secret_2"],
    ["credentialVersion", 4]
  ] as const)("fails closed for a wrong %s binding", (field, value) => {
    const envelope = createEnvelope();
    const wrongBinding = { ...binding, [field]: value } as ProviderCredentialEnvelopeBinding;

    expect(() =>
      decryptProviderCredentialEnvelope({ envelope, masterKey, binding: wrongBinding })
    ).toThrow("Provider credential could not be decrypted.");
  });

  it("fails closed for a wrong master key and every authenticated envelope field", () => {
    const envelope = createEnvelope();
    expect(() =>
      decryptProviderCredentialEnvelope({ envelope, masterKey: otherMasterKey, binding })
    ).toThrow("Provider credential could not be decrypted.");

    const mutations: ProviderCredentialEnvelope[] = [
      { ...envelope, ciphertext: `${envelope.ciphertext[0] === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}` },
      { ...envelope, authTag: `${envelope.authTag[0] === "A" ? "B" : "A"}${envelope.authTag.slice(1)}` },
      { ...envelope, fingerprint: `pvfp_${"A".repeat(22)}` },
      { ...envelope, keyVersion: 8 }
    ];
    for (const mutated of mutations) {
      expect(() =>
        decryptProviderCredentialEnvelope({ envelope: mutated, masterKey, binding })
      ).toThrow();
    }
  });

  it("rejects invalid keys, secrets, bindings, and random sources without echoing secrets", () => {
    expect(() => parseProviderCredentialMasterKey("short")).toThrow(
      "Provider credential master key is unavailable or invalid."
    );
    expect(() =>
      createProviderCredentialEnvelope({
        secret: ` ${secret}`,
        masterKey,
        keyVersion: 1,
        binding
      })
    ).toThrow("Provider credential has an invalid shape.");
    expect(() =>
      createProviderCredentialEnvelope({
        secret,
        masterKey,
        keyVersion: 1,
        binding: { ...binding, orgId: " org_1" }
      })
    ).toThrow("Provider credential binding is invalid.");
    expect(() =>
      createProviderCredentialEnvelope({
        secret,
        masterKey,
        keyVersion: 1,
        binding,
        dependencies: { randomBytes: () => Buffer.alloc(1) }
      })
    ).toThrow("Provider credential random source returned an invalid value.");

    try {
      decryptProviderCredentialEnvelope({
        envelope: { ...createEnvelope(), authTag: "invalid" },
        masterKey,
        binding
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("provider lookup identifier hashing", () => {
  it("produces deterministic, domain-separated lookup hashes without exposing identifiers", () => {
    const account = hashProviderLookupIdentifier({
      masterKey,
      provider: "twilio",
      kind: "account",
      value: binding.externalAccountId
    });
    const repeated = hashProviderLookupIdentifier({
      masterKey,
      provider: "twilio",
      kind: "account",
      value: binding.externalAccountId
    });
    const phone = hashProviderLookupIdentifier({
      masterKey,
      provider: "twilio",
      kind: "phone_number",
      value: binding.externalAccountId
    });
    const service = hashProviderLookupIdentifier({
      masterKey,
      provider: "twilio",
      kind: "messaging_service",
      value: binding.externalAccountId
    });

    expect(account).toBe(repeated);
    expect(account).toMatch(/^pvlookup_v1_[A-Za-z0-9_-]{43}$/);
    expect(account).not.toContain(binding.externalAccountId);
    expect(phone).not.toBe(account);
    expect(service).not.toBe(account);
    expect(service).not.toBe(phone);
    expect(
      hashProviderLookupIdentifier({
        masterKey: otherMasterKey,
        provider: "twilio",
        kind: "account",
        value: binding.externalAccountId
      })
    ).not.toBe(account);
  });

  it("rejects noncanonical provider names, values, and runtime kind impersonation", () => {
    expect(() =>
      hashProviderLookupIdentifier({
        masterKey,
        provider: "Twilio",
        kind: "account",
        value: binding.externalAccountId
      })
    ).toThrow("Provider credential binding is invalid.");
    expect(() =>
      hashProviderLookupIdentifier({
        masterKey,
        provider: "twilio",
        kind: "account",
        value: ` ${binding.externalAccountId}`
      })
    ).toThrow("Provider credential binding is invalid.");
    expect(() =>
      hashProviderLookupIdentifier({
        masterKey,
        provider: "twilio",
        kind: "service" as "account",
        value: binding.externalAccountId
      })
    ).toThrow("Provider credential binding is invalid.");
  });
});

describe("provider discovery candidate identifiers", () => {
  it("creates opaque generation-bound IDs distinct from persistent lookup hashes", () => {
    const input = {
      masterKey,
      orgId: binding.orgId,
      provider: binding.provider,
      providerAccountId: binding.providerAccountId,
      credentialVersion: binding.credentialVersion,
      kind: "phone_number" as const,
      value: "+15555550199"
    };
    const candidate = createProviderDiscoveryCandidateId(input);
    const lookup = hashProviderLookupIdentifier({
      masterKey,
      provider: binding.provider,
      kind: "phone_number",
      value: input.value
    });

    expect(candidate).toMatch(/^pvcandidate_v1_[A-Za-z0-9_-]{43}$/);
    expect(candidate).not.toBe(lookup);
    expect(createProviderDiscoveryCandidateId(input)).toBe(candidate);
    expect(
      createProviderDiscoveryCandidateId({ ...input, credentialVersion: input.credentialVersion + 1 })
    ).not.toBe(candidate);
    expect(createProviderDiscoveryCandidateId({ ...input, orgId: "org_2" })).not.toBe(candidate);
    expect(
      createProviderDiscoveryCandidateId({ ...input, providerAccountId: "provider_account_2" })
    ).not.toBe(candidate);
  });
});
