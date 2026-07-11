function hasSpreadsheetFormulaPrefix(value: string) {
  let index = 0;
  while (
    index < value.length &&
    (value.charCodeAt(index) <= 0x20 || value[index].trim().length === 0)
  ) {
    index += 1;
  }
  return value[index] === "=" || value[index] === "+" || value[index] === "-" || value[index] === "@";
}

export type CsvCellOptions = {
  alwaysQuote?: boolean;
};

/**
 * Serializes one CSV cell while neutralizing spreadsheet formulas and embedded row boundaries.
 * A leading apostrophe is intentionally part of the CSV data; spreadsheet applications treat it
 * as a text marker instead of evaluating the cell.
 */
export function escapeCsvCell(value: unknown, options: CsvCellOptions = {}): string {
  const normalized = value === undefined || value === null ? "" : String(value);
  const safe = hasSpreadsheetFormulaPrefix(normalized) ? `'${normalized}` : normalized;
  const escaped = safe.replace(/"/g, '""');

  if (options.alwaysQuote || /[",\r\n]/.test(safe)) {
    return `"${escaped}"`;
  }

  return escaped;
}
