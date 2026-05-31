export function redactSecret(secret: string | null | undefined): string | null {
  if (!secret) {
    return null;
  }

  const trimmed = secret.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }

  if (trimmed.length <= 8) {
    return `${trimmed.substring(0, 2)}${"*".repeat(trimmed.length - 2)}`;
  }

  return `${trimmed.substring(0, 2)}${"*".repeat(8)}${trimmed.substring(trimmed.length - 4)}`;
}
