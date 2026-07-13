import { describe, expect, it, vi } from "vitest";
import {
  createProviderCredentialEnvelope,
  hashProviderLookupIdentifier
} from "@/lib/integrations/provider-accounts/credential-encryption";
import {
  createProviderSendAdapter,
  ProviderSendRuntimeError,
  type ProviderSendCredentialSnapshot
} from "@/lib/messaging/outbox/provider-runtime";

const masterKey = Buffer.alloc(32, 9);
const accountSid = `AC${"a".repeat(32)}`;
const binding = {
  orgId: "org_demo",
  provider: "twilio" as const,
  externalAccountId: accountSid,
  externalAccountIdHash: hashProviderLookupIdentifier({
    masterKey,
    provider: "twilio",
    kind: "account",
    value: accountSid
  }),
  providerAccountId: "account_demo",
  secretId: "secret_demo",
  credentialVersion: 1
};
const envelope = createProviderCredentialEnvelope({
  secret: "b".repeat(32),
  masterKey,
  keyVersion: 1,
  binding,
  dependencies: { randomBytes: (size) => Buffer.alloc(size, 3) }
});
const snapshot: ProviderSendCredentialSnapshot = {
  orgId: binding.orgId,
  provider: "twilio",
  providerAccountId: binding.providerAccountId,
  externalAccountId: binding.externalAccountId,
  externalAccountIdHash: binding.externalAccountIdHash,
  providerCredentialSecretId: binding.secretId,
  providerCredentialVersion: binding.credentialVersion,
  secret: envelope
};

describe("provider send runtime", () => {
  it("decrypts only the exact bound generation and passes it to the factory", () => {
    const adapter = { name: "twilio", externalAccountId: accountSid };
    const create = vi.fn().mockReturnValue(adapter);
    expect(createProviderSendAdapter(snapshot, {
      environment: { SECRETS_MASTER_KEY: masterKey.toString("base64") },
      factory: { create } as never
    })).toBe(adapter);
    expect(create).toHaveBeenCalledWith({
      name: "twilio",
      credentials: { externalAccountId: accountSid, token: "b".repeat(32) }
    });
  });

  it("collapses tamper, wrong key, and adapter mismatch into one safe error", () => {
    const cases = [
      { value: { ...snapshot, orgId: "org_other" }, environment: { SECRETS_MASTER_KEY: masterKey.toString("base64") } },
      { value: snapshot, environment: { SECRETS_MASTER_KEY: Buffer.alloc(32, 8).toString("base64") } },
      { value: { ...snapshot, secret: { ...snapshot.secret, ciphertext: "tampered" } }, environment: { SECRETS_MASTER_KEY: masterKey.toString("base64") } }
    ];
    for (const testCase of cases) {
      expect(() => createProviderSendAdapter(testCase.value as ProviderSendCredentialSnapshot, {
        environment: testCase.environment,
        factory: { create: vi.fn() }
      })).toThrow(ProviderSendRuntimeError);
    }
    expect(() => createProviderSendAdapter(snapshot, {
      environment: { SECRETS_MASTER_KEY: masterKey.toString("base64") },
      factory: { create: vi.fn().mockReturnValue({ name: "dummy", externalAccountId: "dummy-account" }) }
    })).toThrow(ProviderSendRuntimeError);
  });

  it("never includes credential or binding detail in the error", () => {
    let error: unknown;
    try {
      createProviderSendAdapter(snapshot, { environment: {}, factory: { create: vi.fn() } });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ProviderSendRuntimeError);
    const serialized = JSON.stringify({
      name: (error as Error).name,
      message: (error as Error).message,
      code: (error as ProviderSendRuntimeError).code
    });
    expect(serialized).not.toContain(accountSid);
    expect(serialized).not.toContain(binding.orgId);
    expect(serialized).not.toContain("b".repeat(32));
  });
});
