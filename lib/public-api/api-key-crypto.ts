import { createHmac, randomBytes } from "node:crypto";

const API_KEY_PREFIX_BYTES = 9;
const API_KEY_SECRET_BYTES = 32;
const API_KEY_PREFIX_CHARACTERS = 12;
const API_KEY_SECRET_CHARACTERS = 43;
const API_KEY_PEPPER_MIN_CHARACTERS = 32;
const API_KEY_PEPPER_MAX_CHARACTERS = 2_048;
const API_KEY_PATTERN = new RegExp(
  `^ss_api_([A-Za-z0-9_-]{${API_KEY_PREFIX_CHARACTERS}})_([A-Za-z0-9_-]{${API_KEY_SECRET_CHARACTERS}})$`
);

export const API_KEY_SCHEME = "Bearer";
export const API_KEY_VISIBLE_PREFIX = "ss_api_";
export const API_KEY_MAX_CHARACTERS =
  API_KEY_VISIBLE_PREFIX.length + API_KEY_PREFIX_CHARACTERS + 1 + API_KEY_SECRET_CHARACTERS;

export type GeneratedApiKey = Readonly<{
  token: string;
  prefix: string;
  secretHash: string;
}>;

export type ParsedApiKey = Readonly<{
  token: string;
  prefix: string;
}>;

/**
 * Generate a bearer credential whose raw token is returned to the caller exactly once.
 * The prefix is intentionally non-secret and can be listed in the management UI.
 */
export function generateApiKey(pepper: string): GeneratedApiKey {
  assertApiKeyPepper(pepper);
  const prefix = randomBytes(API_KEY_PREFIX_BYTES).toString("base64url");
  const secret = randomBytes(API_KEY_SECRET_BYTES).toString("base64url");
  const token = `${API_KEY_VISIBLE_PREFIX}${prefix}_${secret}`;

  return Object.freeze({
    token,
    prefix: `${API_KEY_VISIBLE_PREFIX}${prefix}`,
    secretHash: hashApiKey(token, pepper)
  });
}

/** Parse a bounded API key without logging or retaining its secret components separately. */
export function parseApiKey(token: string): ParsedApiKey | null {
  if (
    typeof token !== "string" ||
    token.length !== API_KEY_MAX_CHARACTERS ||
    Array.from(token).some((character) => (character.codePointAt(0) ?? 0) < 33)
  ) {
    return null;
  }

  const match = API_KEY_PATTERN.exec(token);
  if (!match) {
    return null;
  }

  return Object.freeze({ token, prefix: `${API_KEY_VISIBLE_PREFIX}${match[1]}` });
}

/** Domain-separated keyed digest stored in place of the raw bearer credential. */
export function hashApiKey(token: string, pepper: string): string {
  assertApiKeyPepper(pepper);
  const parsed = parseApiKey(token);
  if (!parsed) {
    throw new Error("API key has an invalid shape.");
  }

  return createHmac("sha256", pepper)
    .update("signalstack/public-api-key/v1\0", "utf8")
    .update(parsed.token, "utf8")
    .digest("base64url");
}

/** Hash request metadata before persistence so raw client network identifiers are never retained. */
export function hashApiClientAddress(address: string, pepper: string): string | null {
  assertApiKeyPepper(pepper);
  const normalized = address.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 255 ||
    Array.from(normalized).some((character) => (character.codePointAt(0) ?? 0) < 32)
  ) {
    return null;
  }

  return createHmac("sha256", pepper)
    .update("signalstack/public-api-client-address/v1\0", "utf8")
    .update(normalized, "utf8")
    .digest("base64url");
}

export function readApiKeyPepper(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  const pepper = environment.API_KEY_PEPPER;
  assertApiKeyPepper(pepper);
  return pepper;
}

export function assertApiKeyPepper(pepper: string | undefined): asserts pepper is string {
  if (
    typeof pepper !== "string" ||
    pepper.length < API_KEY_PEPPER_MIN_CHARACTERS ||
    pepper.length > API_KEY_PEPPER_MAX_CHARACTERS ||
    Buffer.byteLength(pepper, "utf8") > 4_096 ||
    Array.from(pepper).some((character) => (character.codePointAt(0) ?? 0) < 32)
  ) {
    throw new Error("API key pepper is unavailable or invalid.");
  }
}

export function parseBearerApiKey(authorization: string | null): ParsedApiKey | null {
  if (!authorization || authorization.length > API_KEY_MAX_CHARACTERS + 16) {
    return null;
  }
  const match = /^Bearer ([^ ]+)$/.exec(authorization);
  return match ? parseApiKey(match[1]) : null;
}
