import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";

const ENVELOPE_VERSION = 1 as const;
const ENVELOPE_ALGORITHM = "aes-256-gcm" as const;
const MASTER_KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MAX_SECRET_BYTES = 2_048;
const MAX_BINDING_BYTES = 512;
const FINGERPRINT_PATTERN = /^pvfp_[A-Za-z0-9_-]{22}$/;

declare const providerCredentialPlaintextBrand: unique symbol;

/** Opaque provider credential material. It must not be serialized, logged, or returned to clients. */
export type DecryptedProviderCredential = string & {
  readonly [providerCredentialPlaintextBrand]: "DecryptedProviderCredential";
};

export type ProviderCredentialEnvelopeBinding = Readonly<{
  orgId: string;
  provider: string;
  externalAccountId: string;
  externalAccountIdHash: string;
  providerAccountId: string;
  secretId: string;
  credentialVersion: number;
}>;

export type ProviderCredentialEnvelope = Readonly<{
  envelopeVersion: typeof ENVELOPE_VERSION;
  algorithm: typeof ENVELOPE_ALGORITHM;
  keyVersion: number;
  iv: string;
  ciphertext: string;
  authTag: string;
  fingerprint: string;
}>;

export type ProviderCredentialCryptoDependencies = Readonly<{
  randomBytes?: (size: number) => Buffer;
}>;

export class ProviderCredentialEncryptionError extends Error {
  readonly code:
    | "INVALID_MASTER_KEY"
    | "INVALID_BINDING"
    | "INVALID_SECRET"
    | "INVALID_ENVELOPE"
    | "DECRYPTION_FAILED";

  constructor(code: ProviderCredentialEncryptionError["code"], message: string) {
    super(message);
    this.name = "ProviderCredentialEncryptionError";
    this.code = code;
  }
}

/** Reads the shared secret root only at the call boundary; provider keys use separate derivation domains. */
export function readProviderCredentialMasterKey(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Buffer {
  return parseProviderCredentialMasterKey(environment.SECRETS_MASTER_KEY);
}

export function parseProviderCredentialMasterKey(
  value: string | Buffer | Uint8Array | undefined
): Buffer {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const key = Buffer.from(value);
    if (key.length === MASTER_KEY_BYTES) {
      return key;
    }
    throw cryptoError("INVALID_MASTER_KEY", "Provider credential master key is unavailable or invalid.");
  }

  if (typeof value !== "string" || value.length > 2_048 || hasControlCharacter(value)) {
    throw cryptoError("INVALID_MASTER_KEY", "Provider credential master key is unavailable or invalid.");
  }

  let key: Buffer | null = null;
  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    const decoded = Buffer.from(value, "base64");
    key = decoded.length === MASTER_KEY_BYTES ? decoded : null;
  }

  if (!key || key.length !== MASTER_KEY_BYTES) {
    throw cryptoError("INVALID_MASTER_KEY", "Provider credential master key is unavailable or invalid.");
  }
  return key;
}

export function createProviderCredentialEnvelope(input: {
  secret: string;
  masterKey: string | Buffer | Uint8Array;
  keyVersion: number;
  binding: ProviderCredentialEnvelopeBinding;
  dependencies?: ProviderCredentialCryptoDependencies;
}): ProviderCredentialEnvelope {
  const masterKey = parseProviderCredentialMasterKey(input.masterKey);
  const secret = parseProviderCredentialPlaintext(input.secret);
  assertKeyVersion(input.keyVersion);
  assertBinding(input.binding);

  const fingerprint = fingerprintProviderCredential(masterKey, secret);
  const randomBytes = input.dependencies?.randomBytes ?? nodeRandomBytes;
  const iv = requireRandomBytes(randomBytes, IV_BYTES);
  const key = deriveEnvelopeKey(masterKey, input.keyVersion);
  const aad = encodeEnvelopeAad(input.binding, input.keyVersion, fingerprint);
  const cipher = createCipheriv(ENVELOPE_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return Object.freeze({
    envelopeVersion: ENVELOPE_VERSION,
    algorithm: ENVELOPE_ALGORITHM,
    keyVersion: input.keyVersion,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    fingerprint
  });
}

export function decryptProviderCredentialEnvelope(input: {
  envelope: ProviderCredentialEnvelope;
  masterKey: string | Buffer | Uint8Array;
  binding: ProviderCredentialEnvelopeBinding;
}): DecryptedProviderCredential {
  const masterKey = parseProviderCredentialMasterKey(input.masterKey);
  assertBinding(input.binding);
  const envelope = parseEnvelope(input.envelope);
  const key = deriveEnvelopeKey(masterKey, envelope.keyVersion);
  const aad = encodeEnvelopeAad(input.binding, envelope.keyVersion, envelope.fingerprint);

  try {
    const decipher = createDecipheriv(ENVELOPE_ALGORITHM, key, envelope.iv, {
      authTagLength: AUTH_TAG_BYTES
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(envelope.authTag);
    const plaintext = Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final()
    ]).toString("utf8");
    const secret = parseProviderCredentialPlaintext(plaintext);
    const actualFingerprint = fingerprintProviderCredential(masterKey, secret);
    const actual = Buffer.from(actualFingerprint, "utf8");
    const expected = Buffer.from(envelope.fingerprint, "utf8");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error("fingerprint mismatch");
    }
    return secret;
  } catch {
    throw cryptoError("DECRYPTION_FAILED", "Provider credential could not be decrypted.");
  }
}

export function parseProviderCredentialPlaintext(value: string): DecryptedProviderCredential {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES ||
    hasControlCharacter(value)
  ) {
    throw cryptoError("INVALID_SECRET", "Provider credential has an invalid shape.");
  }
  return value as DecryptedProviderCredential;
}

/** A keyed, domain-separated exact-match identifier for pre-tenant account and number lookups. */
export function hashProviderLookupIdentifier(input: {
  masterKey: string | Buffer | Uint8Array;
  provider: string;
  kind: "account" | "phone_number" | "messaging_service";
  value: string;
}): string {
  const masterKey = parseProviderCredentialMasterKey(input.masterKey);
  const provider = parseProviderName(input.provider);
  if (
    input.kind !== "account" &&
    input.kind !== "phone_number" &&
    input.kind !== "messaging_service"
  ) {
    throw cryptoError("INVALID_BINDING", "Provider credential binding is invalid.");
  }
  const value = parseBindingComponent(input.value);
  const key = createHmac("sha256", masterKey)
    .update("signalstack/provider-lookup-key/v1\0", "utf8")
    .digest();
  const digest = createHmac("sha256", key)
    .update(
      JSON.stringify({
        context: "signalstack/provider-lookup-identifier",
        version: 1,
        provider,
        kind: input.kind,
        value
      }),
      "utf8"
    )
    .digest("base64url");
  return `pvlookup_v1_${digest}`;
}

/** Opaque, generation-bound discovery evidence. It is never persisted as an ownership lookup hash. */
export function createProviderDiscoveryCandidateId(input: {
  masterKey: string | Buffer | Uint8Array;
  orgId: string;
  provider: string;
  providerAccountId: string;
  credentialVersion: number;
  kind: "phone_number" | "messaging_service";
  value: string;
}): string {
  const masterKey = parseProviderCredentialMasterKey(input.masterKey);
  const provider = parseProviderName(input.provider);
  const orgId = parseBindingComponent(input.orgId);
  const providerAccountId = parseBindingComponent(input.providerAccountId);
  const value = parseBindingComponent(input.value);
  if (
    (input.kind !== "phone_number" && input.kind !== "messaging_service") ||
    !Number.isSafeInteger(input.credentialVersion) ||
    input.credentialVersion < 1
  ) {
    throw cryptoError("INVALID_BINDING", "Provider credential binding is invalid.");
  }
  const key = createHmac("sha256", masterKey)
    .update("signalstack/provider-discovery-candidate-key/v1\0", "utf8")
    .digest();
  const digest = createHmac("sha256", key)
    .update(
      JSON.stringify({
        context: "signalstack/provider-discovery-candidate",
        version: 1,
        orgId,
        provider,
        providerAccountId,
        credentialVersion: input.credentialVersion,
        kind: input.kind,
        value
      }),
      "utf8"
    )
    .digest("base64url");
  return `pvcandidate_v1_${digest}`;
}

function fingerprintProviderCredential(
  masterKey: Buffer,
  secret: DecryptedProviderCredential
): string {
  const key = createHmac("sha256", masterKey)
    .update("signalstack/provider-credential-fingerprint-key/v1\0", "utf8")
    .digest();
  const digest = createHmac("sha256", key)
    .update("signalstack/provider-credential-fingerprint/v1\0", "utf8")
    .update(secret, "utf8")
    .digest()
    .subarray(0, 16);
  return `pvfp_${digest.toString("base64url")}`;
}

function deriveEnvelopeKey(masterKey: Buffer, keyVersion: number): Buffer {
  const version = Buffer.allocUnsafe(4);
  version.writeUInt32BE(keyVersion);
  return createHmac("sha256", masterKey)
    .update("signalstack/provider-credential-envelope-key/v1\0", "utf8")
    .update(version)
    .digest();
}

function encodeEnvelopeAad(
  binding: ProviderCredentialEnvelopeBinding,
  keyVersion: number,
  fingerprint: string
): Buffer {
  return Buffer.from(
    JSON.stringify({
      context: "signalstack/provider-credential-envelope",
      envelopeVersion: ENVELOPE_VERSION,
      keyVersion,
      orgId: binding.orgId,
      provider: binding.provider,
      externalAccountId: binding.externalAccountId,
      externalAccountIdHash: binding.externalAccountIdHash,
      providerAccountId: binding.providerAccountId,
      secretId: binding.secretId,
      credentialVersion: binding.credentialVersion,
      fingerprint
    }),
    "utf8"
  );
}

function parseEnvelope(envelope: ProviderCredentialEnvelope): {
  keyVersion: number;
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
  fingerprint: string;
} {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    Object.keys(envelope).length !== 7 ||
    envelope.envelopeVersion !== ENVELOPE_VERSION ||
    envelope.algorithm !== ENVELOPE_ALGORITHM ||
    !FINGERPRINT_PATTERN.test(envelope.fingerprint)
  ) {
    throw cryptoError("INVALID_ENVELOPE", "Provider credential envelope is invalid.");
  }
  assertKeyVersion(envelope.keyVersion);
  const iv = decodeCanonicalBase64Url(envelope.iv, IV_BYTES);
  const ciphertext = decodeCanonicalBase64Url(envelope.ciphertext, null);
  const authTag = decodeCanonicalBase64Url(envelope.authTag, AUTH_TAG_BYTES);
  if (!iv || !ciphertext || ciphertext.length < 1 || ciphertext.length > MAX_SECRET_BYTES || !authTag) {
    throw cryptoError("INVALID_ENVELOPE", "Provider credential envelope is invalid.");
  }
  return { keyVersion: envelope.keyVersion, iv, ciphertext, authTag, fingerprint: envelope.fingerprint };
}

function assertBinding(binding: ProviderCredentialEnvelopeBinding): void {
  if (
    !binding ||
    !validBindingComponent(binding.orgId) ||
    parseProviderName(binding.provider) !== binding.provider ||
    !validBindingComponent(binding.externalAccountId) ||
    !/^pvlookup_v1_[A-Za-z0-9_-]{43}$/.test(binding.externalAccountIdHash) ||
    !validBindingComponent(binding.providerAccountId) ||
    !validBindingComponent(binding.secretId) ||
    !Number.isSafeInteger(binding.credentialVersion) ||
    binding.credentialVersion < 1
  ) {
    throw cryptoError("INVALID_BINDING", "Provider credential binding is invalid.");
  }
}

function parseProviderName(value: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
    throw cryptoError("INVALID_BINDING", "Provider credential binding is invalid.");
  }
  return value;
}

function parseBindingComponent(value: string): string {
  if (!validBindingComponent(value)) {
    throw cryptoError("INVALID_BINDING", "Provider credential binding is invalid.");
  }
  return value;
}

function validBindingComponent(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Buffer.byteLength(value, "utf8") <= MAX_BINDING_BYTES &&
    !hasControlCharacter(value)
  );
}

function assertKeyVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw cryptoError("INVALID_ENVELOPE", "Provider credential envelope is invalid.");
  }
}

function decodeCanonicalBase64Url(value: string, expectedLength: number | null): Buffer | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    return null;
  }
  return expectedLength === null || decoded.length === expectedLength ? decoded : null;
}

function requireRandomBytes(randomBytes: (size: number) => Buffer, size: number): Buffer {
  const value = randomBytes(size);
  if (!Buffer.isBuffer(value) || value.length !== size) {
    throw new Error("Provider credential random source returned an invalid value.");
  }
  return Buffer.from(value);
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

function cryptoError(
  code: ProviderCredentialEncryptionError["code"],
  message: string
): ProviderCredentialEncryptionError {
  return new ProviderCredentialEncryptionError(code, message);
}
