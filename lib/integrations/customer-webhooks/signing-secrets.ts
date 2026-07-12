import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";

const ENVELOPE_VERSION = 1 as const;
const ENVELOPE_ALGORITHM = "aes-256-gcm" as const;
const MASTER_KEY_BYTES = 32;
const SIGNING_SECRET_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;
const MAX_BINDING_COMPONENT_BYTES = 512;
const SIGNING_SECRET_PATTERN = /^whsec_([A-Za-z0-9_-]{43})$/;

export const CUSTOMER_WEBHOOK_SECRET_PREFIX = "whsec_";

export type CustomerWebhookSecretBinding = Readonly<{
  orgId: string;
  endpointId: string;
  subscriptionId: string;
  secretId: string;
  secretVersion: number;
}>;

export type CustomerWebhookSigningSecretEnvelope = Readonly<{
  envelopeVersion: typeof ENVELOPE_VERSION;
  algorithm: typeof ENVELOPE_ALGORITHM;
  keyVersion: number;
  iv: string;
  ciphertext: string;
  authTag: string;
  fingerprint: string;
}>;

export type CreatedCustomerWebhookSigningSecret = Readonly<{
  /** Return once at creation/rotation and never persist or log this value. */
  secret: string;
  envelope: CustomerWebhookSigningSecretEnvelope;
}>;

export type WebhookSecretCryptoDependencies = Readonly<{
  randomBytes?: (size: number) => Buffer;
}>;

export class CustomerWebhookSigningSecretError extends Error {
  readonly code: "INVALID_MASTER_KEY" | "INVALID_BINDING" | "INVALID_SECRET" | "INVALID_ENVELOPE" | "DECRYPTION_FAILED";

  constructor(code: CustomerWebhookSigningSecretError["code"], message: string) {
    super(message);
    this.name = "CustomerWebhookSigningSecretError";
    this.code = code;
  }
}

/**
 * Read the master key only at the call boundary. Importing this module never reads environment state.
 */
export function readCustomerWebhookSecretsMasterKey(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Buffer {
  return parseCustomerWebhookSecretsMasterKey(environment.SECRETS_MASTER_KEY);
}

export function parseCustomerWebhookSecretsMasterKey(value: string | Buffer | Uint8Array | undefined): Buffer {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const key = Buffer.from(value);
    if (key.length === MASTER_KEY_BYTES) {
      return key;
    }
    throw secretError("INVALID_MASTER_KEY", "Customer webhook secrets master key is unavailable or invalid.");
  }

  if (typeof value !== "string" || value.length > 2_048 || hasControlCharacter(value)) {
    throw secretError("INVALID_MASTER_KEY", "Customer webhook secrets master key is unavailable or invalid.");
  }

  let key: Buffer | null = null;
  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === MASTER_KEY_BYTES) {
      key = decoded;
    }
  }

  if (!key || key.length !== MASTER_KEY_BYTES) {
    throw secretError("INVALID_MASTER_KEY", "Customer webhook secrets master key is unavailable or invalid.");
  }
  return key;
}

/**
 * Creates a 256-bit receiver signing secret and an authenticated envelope. The raw secret is deliberately
 * absent from the envelope and is expected to be shown to the customer exactly once.
 */
export function createCustomerWebhookSigningSecret(input: {
  masterKey: string | Buffer | Uint8Array;
  keyVersion: number;
  binding: CustomerWebhookSecretBinding;
  dependencies?: WebhookSecretCryptoDependencies;
}): CreatedCustomerWebhookSigningSecret {
  const randomBytes = input.dependencies?.randomBytes ?? nodeRandomBytes;
  const secretBytes = requireRandomBytes(randomBytes, SIGNING_SECRET_BYTES);
  const secret = `${CUSTOMER_WEBHOOK_SECRET_PREFIX}${secretBytes.toString("base64url")}`;
  const envelope = encryptCustomerWebhookSigningSecret({
    secret,
    masterKey: input.masterKey,
    keyVersion: input.keyVersion,
    binding: input.binding,
    dependencies: input.dependencies
  });

  return Object.freeze({ secret, envelope });
}

export function encryptCustomerWebhookSigningSecret(input: {
  secret: string;
  masterKey: string | Buffer | Uint8Array;
  keyVersion: number;
  binding: CustomerWebhookSecretBinding;
  dependencies?: WebhookSecretCryptoDependencies;
}): CustomerWebhookSigningSecretEnvelope {
  const masterKey = parseCustomerWebhookSecretsMasterKey(input.masterKey);
  assertKeyVersion(input.keyVersion);
  assertBinding(input.binding);
  parseCustomerWebhookSigningSecret(input.secret);
  const fingerprint = fingerprintCustomerWebhookSigningSecret(input.secret);
  const randomBytes = input.dependencies?.randomBytes ?? nodeRandomBytes;
  const iv = requireRandomBytes(randomBytes, GCM_IV_BYTES);
  const key = deriveEnvelopeKey(masterKey, input.keyVersion);
  const aad = encodeEnvelopeAad(input.binding, input.keyVersion, fingerprint);

  const cipher = createCipheriv(ENVELOPE_ALGORITHM, key, iv, { authTagLength: GCM_AUTH_TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(input.secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Object.freeze({
    envelopeVersion: ENVELOPE_VERSION,
    algorithm: ENVELOPE_ALGORITHM,
    keyVersion: input.keyVersion,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: authTag.toString("base64url"),
    fingerprint
  });
}

export function decryptCustomerWebhookSigningSecret(input: {
  envelope: CustomerWebhookSigningSecretEnvelope;
  masterKey: string | Buffer | Uint8Array;
  binding: CustomerWebhookSecretBinding;
}): string {
  const masterKey = parseCustomerWebhookSecretsMasterKey(input.masterKey);
  assertBinding(input.binding);
  const envelope = parseEnvelope(input.envelope);
  const key = deriveEnvelopeKey(masterKey, envelope.keyVersion);
  const aad = encodeEnvelopeAad(input.binding, envelope.keyVersion, envelope.fingerprint);

  try {
    const decipher = createDecipheriv(ENVELOPE_ALGORITHM, key, envelope.iv, {
      authTagLength: GCM_AUTH_TAG_BYTES
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(envelope.authTag);
    const plaintext = Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString("utf8");
    parseCustomerWebhookSigningSecret(plaintext);

    const actualFingerprint = fingerprintCustomerWebhookSigningSecret(plaintext);
    const actual = Buffer.from(actualFingerprint, "utf8");
    const expected = Buffer.from(envelope.fingerprint, "utf8");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error("fingerprint mismatch");
    }
    return plaintext;
  } catch {
    throw secretError("DECRYPTION_FAILED", "Customer webhook signing secret could not be decrypted.");
  }
}

/** A non-secret identifier suitable for storage and administrative display. */
export function fingerprintCustomerWebhookSigningSecret(secret: string): string {
  const secretBytes = parseCustomerWebhookSigningSecret(secret);
  const digest = createHash("sha256")
    .update("signalstack/customer-webhook-signing-secret-fingerprint/v1\0", "utf8")
    .update(secretBytes)
    .digest()
    .subarray(0, 16);
  return `whfp_${digest.toString("base64url")}`;
}

/** Returns a fresh copy so callers cannot mutate shared secret material. */
export function parseCustomerWebhookSigningSecret(secret: string): Buffer {
  if (typeof secret !== "string" || secret.length !== CUSTOMER_WEBHOOK_SECRET_PREFIX.length + 43) {
    throw secretError("INVALID_SECRET", "Customer webhook signing secret has an invalid shape.");
  }
  const match = SIGNING_SECRET_PATTERN.exec(secret);
  if (!match) {
    throw secretError("INVALID_SECRET", "Customer webhook signing secret has an invalid shape.");
  }
  const bytes = Buffer.from(match[1], "base64url");
  if (bytes.length !== SIGNING_SECRET_BYTES || bytes.toString("base64url") !== match[1]) {
    throw secretError("INVALID_SECRET", "Customer webhook signing secret has an invalid shape.");
  }
  return bytes;
}

function parseEnvelope(envelope: CustomerWebhookSigningSecretEnvelope): {
  keyVersion: number;
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
  fingerprint: string;
} {
  if (
    !envelope ||
    envelope.envelopeVersion !== ENVELOPE_VERSION ||
    envelope.algorithm !== ENVELOPE_ALGORITHM ||
    !/^whfp_[A-Za-z0-9_-]{22}$/.test(envelope.fingerprint)
  ) {
    throw secretError("INVALID_ENVELOPE", "Customer webhook signing secret envelope is invalid.");
  }
  assertKeyVersion(envelope.keyVersion);

  const iv = decodeCanonicalBase64Url(envelope.iv, GCM_IV_BYTES);
  const ciphertext = decodeCanonicalBase64Url(
    envelope.ciphertext,
    CUSTOMER_WEBHOOK_SECRET_PREFIX.length + 43
  );
  const authTag = decodeCanonicalBase64Url(envelope.authTag, GCM_AUTH_TAG_BYTES);
  if (!iv || !ciphertext || !authTag) {
    throw secretError("INVALID_ENVELOPE", "Customer webhook signing secret envelope is invalid.");
  }

  return {
    keyVersion: envelope.keyVersion,
    iv,
    ciphertext,
    authTag,
    fingerprint: envelope.fingerprint
  };
}

function encodeEnvelopeAad(
  binding: CustomerWebhookSecretBinding,
  keyVersion: number,
  fingerprint: string
): Buffer {
  return Buffer.from(
    JSON.stringify({
      context: "signalstack/customer-webhook-signing-secret",
      envelopeVersion: ENVELOPE_VERSION,
      keyVersion,
      orgId: binding.orgId,
      endpointId: binding.endpointId,
      subscriptionId: binding.subscriptionId,
      secretId: binding.secretId,
      secretVersion: binding.secretVersion,
      fingerprint
    }),
    "utf8"
  );
}

function deriveEnvelopeKey(masterKey: Buffer, keyVersion: number): Buffer {
  const version = Buffer.allocUnsafe(4);
  version.writeUInt32BE(keyVersion);
  return createHmac("sha256", masterKey)
    .update("signalstack/customer-webhook-envelope-key/v1\0", "utf8")
    .update(version)
    .digest();
}

function assertBinding(binding: CustomerWebhookSecretBinding): void {
  if (
    !binding ||
    !validBindingComponent(binding.orgId) ||
    !validBindingComponent(binding.endpointId) ||
    !validBindingComponent(binding.subscriptionId) ||
    !validBindingComponent(binding.secretId) ||
    !Number.isSafeInteger(binding.secretVersion) ||
    binding.secretVersion < 1
  ) {
    throw secretError("INVALID_BINDING", "Customer webhook signing secret binding is invalid.");
  }
}

function validBindingComponent(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Buffer.byteLength(value, "utf8") <= MAX_BINDING_COMPONENT_BYTES &&
    !hasControlCharacter(value)
  );
}

function assertKeyVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw secretError("INVALID_ENVELOPE", "Customer webhook signing secret key version is invalid.");
  }
}

function decodeCanonicalBase64Url(value: string, expectedBytes: number): Buffer | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedBytes && decoded.toString("base64url") === value ? decoded : null;
}

function requireRandomBytes(randomBytes: (size: number) => Buffer, size: number): Buffer {
  const value = randomBytes(size);
  if (!Buffer.isBuffer(value) || value.length !== size) {
    throw new Error("Customer webhook random source returned an invalid value.");
  }
  return Buffer.from(value);
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

function secretError(
  code: CustomerWebhookSigningSecretError["code"],
  message: string
): CustomerWebhookSigningSecretError {
  return new CustomerWebhookSigningSecretError(code, message);
}
