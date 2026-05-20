export type CsvRow = Record<string, string>;

export function parseCsv(input: string): CsvRow[] {
  const rows = parseCsvCells(input);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0)).map((row) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      if (header) {
        record[header] = row[index]?.trim() ?? "";
      }
    });
    return record;
  });
}

function parseCsvCells(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
