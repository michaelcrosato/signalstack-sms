import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

const MASTER_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_VERSION = 1;
const MAX_PLAINTEXT_BYTES = 131_072;

export type IdempotencyResponseBinding = Readonly<{
  orgId: string;
  credentialId: string;
  keyHash: string;
  method: string;
  canonicalRoute: string;
  requestHash: string;
}>;

type StoredIdempotencyResponse = Readonly<{
  v: 1;
  alg: "A256GCM";
  kid: 1;
  iv: string;
  ciphertext: string;
  tag: string;
}>;

/** Encrypt replay snapshots so one-time credentials and ordinary resource data are never plaintext at rest. */
export function encryptIdempotencyResponse(
  response: Prisma.InputJsonValue,
  binding: IdempotencyResponseBinding,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Prisma.InputJsonObject {
  const masterKey = readIdempotencyMasterKey(environment);
  const plaintext = Buffer.from(JSON.stringify(response), "utf8");
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new Error("Idempotency response exceeds the encryption limit.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(masterKey), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(bindingAad(binding));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const stored: StoredIdempotencyResponse = Object.freeze({
    v: 1,
    alg: "A256GCM",
    kid: KEY_VERSION,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url")
  });
  return stored;
}

export function decryptIdempotencyResponse(
  value: Prisma.JsonValue | Prisma.InputJsonValue,
  binding: IdempotencyResponseBinding,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Prisma.JsonValue {
  const stored = parseStoredResponse(value);
  const masterKey = readIdempotencyMasterKey(environment);
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(masterKey), stored.iv, {
      authTagLength: TAG_BYTES
    });
    decipher.setAAD(bindingAad(binding));
    decipher.setAuthTag(stored.tag);
    const plaintext = Buffer.concat([decipher.update(stored.ciphertext), decipher.final()]);
    if (plaintext.length > MAX_PLAINTEXT_BYTES) {
      throw new Error("oversized plaintext");
    }
    return JSON.parse(plaintext.toString("utf8")) as Prisma.JsonValue;
  } catch {
    throw new Error("Idempotency response snapshot could not be decrypted.");
  }
}

export function readIdempotencyMasterKey(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Buffer {
  const value = environment.SECRETS_MASTER_KEY;
  if (typeof value !== "string" || value.length > 2_048 || hasControl(value)) {
    throw new Error("Idempotency encryption master key is unavailable or invalid.");
  }
  let key: Buffer | null = null;
  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    const decoded = Buffer.from(value, "base64");
    key = decoded.length === MASTER_KEY_BYTES ? decoded : null;
  }
  if (!key || key.length !== MASTER_KEY_BYTES) {
    throw new Error("Idempotency encryption master key is unavailable or invalid.");
  }
  return key;
}

function deriveKey(masterKey: Buffer): Buffer {
  return createHmac("sha256", masterKey)
    .update("signalstack/public-api-idempotency-response-key/v1\0", "utf8")
    .update(Buffer.from([0, 0, 0, KEY_VERSION]))
    .digest();
}

function bindingAad(binding: IdempotencyResponseBinding): Buffer {
  for (const value of Object.values(binding)) {
    if (typeof value !== "string" || value.length < 1 || value.length > 512 || hasControl(value)) {
      throw new Error("Idempotency response binding is invalid.");
    }
  }
  return Buffer.from(
    JSON.stringify({
      context: "signalstack/public-api-idempotency-response",
      v: 1,
      ...binding
    }),
    "utf8"
  );
}

function parseStoredResponse(value: Prisma.JsonValue | Prisma.InputJsonValue): {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
} {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Idempotency response snapshot is invalid.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 6 ||
    candidate.v !== 1 ||
    candidate.alg !== "A256GCM" ||
    candidate.kid !== KEY_VERSION ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string" ||
    typeof candidate.tag !== "string"
  ) {
    throw new Error("Idempotency response snapshot is invalid.");
  }
  const iv = decodeBase64Url(candidate.iv, IV_BYTES);
  const ciphertext = decodeBase64Url(candidate.ciphertext, null);
  const tag = decodeBase64Url(candidate.tag, TAG_BYTES);
  if (!iv || !ciphertext || !tag || ciphertext.length > MAX_PLAINTEXT_BYTES + TAG_BYTES) {
    throw new Error("Idempotency response snapshot is invalid.");
  }
  return { iv, ciphertext, tag };
}

function decodeBase64Url(value: string, expectedLength: number | null): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || (expectedLength !== null && decoded.length !== expectedLength)) {
    return null;
  }
  return decoded;
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}
