export const AUTH_TOKEN_MIN_CHARACTERS = 32;
export const AUTH_TOKEN_MAX_CHARACTERS = 192;
export const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Shared exact-shape policy for bootstrap, invite, and reset bearer tokens.
 * The value is never trimmed: surrounding whitespace must fail instead of mutating a secret.
 */
export function isValidAuthToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= AUTH_TOKEN_MIN_CHARACTERS &&
    value.length <= AUTH_TOKEN_MAX_CHARACTERS &&
    AUTH_TOKEN_PATTERN.test(value)
  );
}
