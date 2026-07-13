import {
  decryptProviderCredentialEnvelope,
  readProviderCredentialMasterKey,
  type ProviderCredentialEnvelope
} from "@/lib/integrations/provider-accounts/credential-encryption";
import { providerFactory, type ProviderFactory } from "@/lib/messaging/provider/factory";
import type { ProviderAdapter } from "@/lib/messaging/provider/types";

export type ProviderSendCredentialSnapshot = Readonly<{
  orgId: string;
  provider: "twilio";
  providerAccountId: string;
  externalAccountId: string;
  externalAccountIdHash: string;
  providerCredentialSecretId: string;
  providerCredentialVersion: number;
  secret: Readonly<{
    envelopeVersion: number;
    algorithm: string;
    keyVersion: number;
    iv: string;
    ciphertext: string;
    authTag: string;
    fingerprint: string;
  }>;
}>;

export class ProviderSendRuntimeError extends Error {
  readonly code: "PROVIDER_CREDENTIAL_UNAVAILABLE";

  constructor() {
    super("Provider credential is unavailable.");
    this.name = "ProviderSendRuntimeError";
    this.code = "PROVIDER_CREDENTIAL_UNAVAILABLE";
  }
}

/**
 * Create a short-lived adapter from an exact, already-authorized credential generation. The decrypted
 * token never escapes the provider factory and the returned error deliberately exposes no crypto detail.
 */
export function createProviderSendAdapter(
  snapshot: ProviderSendCredentialSnapshot,
  dependencies: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    factory?: ProviderFactory;
  }> = {}
): ProviderAdapter {
  try {
    assertSnapshot(snapshot);
    const envelope: ProviderCredentialEnvelope = {
      envelopeVersion: snapshot.secret.envelopeVersion as 1,
      algorithm: snapshot.secret.algorithm as "aes-256-gcm",
      keyVersion: snapshot.secret.keyVersion,
      iv: snapshot.secret.iv,
      ciphertext: snapshot.secret.ciphertext,
      authTag: snapshot.secret.authTag,
      fingerprint: snapshot.secret.fingerprint
    };
    const token = decryptProviderCredentialEnvelope({
      envelope,
      masterKey: readProviderCredentialMasterKey(dependencies.environment ?? process.env),
      binding: {
        orgId: snapshot.orgId,
        provider: snapshot.provider,
        externalAccountId: snapshot.externalAccountId,
        externalAccountIdHash: snapshot.externalAccountIdHash,
        providerAccountId: snapshot.providerAccountId,
        secretId: snapshot.providerCredentialSecretId,
        credentialVersion: snapshot.providerCredentialVersion
      }
    });
    const adapter = (dependencies.factory ?? providerFactory).create({
      name: "twilio",
      credentials: { externalAccountId: snapshot.externalAccountId, token }
    });
    if (adapter.name !== "twilio" || adapter.externalAccountId !== snapshot.externalAccountId) {
      throw new Error("Provider adapter identity mismatch.");
    }
    return adapter;
  } catch {
    throw new ProviderSendRuntimeError();
  }
}

function assertSnapshot(snapshot: ProviderSendCredentialSnapshot): void {
  if (
    snapshot.provider !== "twilio" ||
    !boundedIdentifier(snapshot.orgId) ||
    !boundedIdentifier(snapshot.providerAccountId) ||
    !boundedIdentifier(snapshot.providerCredentialSecretId) ||
    !/^AC[a-fA-F0-9]{32}$/.test(snapshot.externalAccountId) ||
    !/^pvlookup_v1_[A-Za-z0-9_-]{43}$/.test(snapshot.externalAccountIdHash) ||
    !Number.isSafeInteger(snapshot.providerCredentialVersion) ||
    snapshot.providerCredentialVersion < 1 ||
    !snapshot.secret ||
    snapshot.secret.envelopeVersion !== 1 ||
    snapshot.secret.algorithm !== "aes-256-gcm"
  ) {
    throw new Error("Provider send credential snapshot is invalid.");
  }
}

function boundedIdentifier(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 191 &&
    value.trim() === value &&
    !Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32)
  );
}
