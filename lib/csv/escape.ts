/**
 * Escapes a value for inclusion in a CSV file, providing protection against CSV Injection
 * (also known as Formula Injection).
 *
 * It adds a single quote prefix to values starting with formula characters (=, +, -, @)
 * and escapes double quotes.
 */
export function escapeCsv(value: unknown): string {
  const normalized = value === undefined || value === null ? "" : String(value);

  // Prevent CSV injection by escaping formula starters with a single quote
  let safeStr = normalized;
  if (/^[=+\-@\t\r]/.test(safeStr)) {
    safeStr = "'" + safeStr;
  }

  // Quote the string if it contains characters that require quoting in CSV
  if (safeStr.includes(",") || safeStr.includes('"') || safeStr.includes("\n")) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }

  return safeStr;
}
