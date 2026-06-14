/**
 * Centralized secret redaction utility.
 * Replaces sensitive credential values with masked versions to prevent leaks.
 */
export function redactSecret(secret: string | null | undefined): string {
  if (secret === null || secret === undefined) {
    return "";
  }
  const trimmed = secret.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.length < 8) {
    return "********";
  }
  const suffix = trimmed.slice(-4);
  return `********${suffix}`;
}
