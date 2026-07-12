import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const PASSWORD_HASH_ALGORITHM = "scrypt";
const PASSWORD_HASH_VERSION = 1;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;
const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_CHARACTERS = 128;
const MAX_PASSWORD_BYTES = 256;
const OPAQUE_TOKEN_BYTES = 32;
const MAX_OPAQUE_TOKEN_CHARACTERS = 192;

const disallowedPasswords = new Set([
  "password1234",
  "signalstack",
  "signalstack123",
  "changeme1234",
  "administrator",
  "letmein123456"
]);

export type OpaqueTokenPurpose = "session" | "invite" | "reset";

export type OpaqueToken = {
  token: string;
  tokenHash: string;
};

export type PasswordPolicyResult =
  | { valid: true }
  | {
      valid: false;
      reason: "too-short" | "too-long" | "blank" | "known-default";
    };

type ParsedPasswordHash = {
  version: number;
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function evaluatePasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < MIN_PASSWORD_CHARACTERS) {
    return { valid: false, reason: "too-short" };
  }

  if (password.length > MAX_PASSWORD_CHARACTERS || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return { valid: false, reason: "too-long" };
  }

  if (password.trim().length === 0) {
    return { valid: false, reason: "blank" };
  }

  if (disallowedPasswords.has(password.trim().toLowerCase())) {
    return { valid: false, reason: "known-default" };
  }

  return { valid: true };
}

export async function hashPassword(password: string) {
  const policy = evaluatePasswordPolicy(password);
  if (!policy.valid) {
    throw new Error(`Password policy rejected the password: ${policy.reason}.`);
  }

  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const hash = await derivePasswordHash(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });

  return [
    PASSWORD_HASH_ALGORITHM,
    `v=${PASSWORD_HASH_VERSION}`,
    `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    salt.toString("base64url"),
    hash.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string) {
  if (password.length > MAX_PASSWORD_CHARACTERS || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return false;
  }

  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) {
    return false;
  }

  const actual = await derivePasswordHash(password, parsed.salt, parsed);
  return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
}

export function passwordHashNeedsRehash(encodedHash: string) {
  const parsed = parsePasswordHash(encodedHash);
  return (
    !parsed ||
    parsed.version !== PASSWORD_HASH_VERSION ||
    parsed.N !== SCRYPT_N ||
    parsed.r !== SCRYPT_R ||
    parsed.p !== SCRYPT_P
  );
}

export function createOpaqueToken(purpose: OpaqueTokenPurpose): OpaqueToken {
  const token = `ss_${purpose}_${randomBytes(OPAQUE_TOKEN_BYTES).toString("base64url")}`;
  return { token, tokenHash: hashOpaqueToken(token) };
}

export function hashOpaqueToken(token: string) {
  if (
    typeof token !== "string" ||
    token.length < 16 ||
    token.length > MAX_OPAQUE_TOKEN_CHARACTERS ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw new Error("Opaque token has an invalid shape.");
  }

  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function hashLocalSessionToken(token: string, secret: string) {
  // Reuse the bounded token parser before any keyed work. The unkeyed digest is intentionally discarded.
  hashOpaqueToken(token);
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 1_024) {
    throw new Error("Local session hashing key has an invalid shape.");
  }
  return createHmac("sha256", secret)
    .update("signalstack/local-session/v1\0", "utf8")
    .update(token, "utf8")
    .digest("base64url");
}

export function safeEqualSecret(candidate: string, expected: string) {
  if (
    typeof candidate !== "string" ||
    typeof expected !== "string" ||
    candidate.length > MAX_OPAQUE_TOKEN_CHARACTERS ||
    expected.length > MAX_OPAQUE_TOKEN_CHARACTERS
  ) {
    return false;
  }

  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

async function derivePasswordHash(
  password: string,
  salt: Buffer,
  parameters: Pick<ParsedPasswordHash, "N" | "r" | "p">
) {
  return scrypt(password, salt, PASSWORD_HASH_BYTES, {
    N: parameters.N,
    r: parameters.r,
    p: parameters.p,
    maxmem: SCRYPT_MAX_MEMORY
  });
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  if (typeof encodedHash !== "string" || encodedHash.length > 256) {
    return null;
  }

  const parts = encodedHash.split("$");
  if (parts.length !== 5 || parts[0] !== PASSWORD_HASH_ALGORITHM) {
    return null;
  }

  const versionMatch = /^v=(\d+)$/.exec(parts[1]);
  const parametersMatch = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[2]);
  if (!versionMatch || !parametersMatch || !/^[A-Za-z0-9_-]+$/.test(parts[3]) || !/^[A-Za-z0-9_-]+$/.test(parts[4])) {
    return null;
  }

  const version = Number.parseInt(versionMatch[1], 10);
  const N = Number.parseInt(parametersMatch[1], 10);
  const r = Number.parseInt(parametersMatch[2], 10);
  const p = Number.parseInt(parametersMatch[3], 10);
  if (version !== PASSWORD_HASH_VERSION || N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) {
    return null;
  }

  let salt: Buffer;
  let hash: Buffer;
  try {
    salt = Buffer.from(parts[3], "base64url");
    hash = Buffer.from(parts[4], "base64url");
  } catch {
    return null;
  }

  if (salt.length !== PASSWORD_SALT_BYTES || hash.length !== PASSWORD_HASH_BYTES) {
    return null;
  }

  return { version, N, r, p, salt, hash };
}
