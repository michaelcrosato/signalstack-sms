import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "@/lib/csv/escape";

describe("escapeCsvCell", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(A1:A2)"])(
    "neutralizes spreadsheet formula prefix %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`);
    }
  );

  it("neutralizes formula prefixes after control characters or spaces", () => {
    expect(escapeCsvCell("\t=1+1")).toBe("'\t=1+1");
    expect(escapeCsvCell("\r=1+1")).toBe("\"'\r=1+1\"");
    expect(escapeCsvCell("\n=1+1")).toBe("\"'\n=1+1\"");
    expect(escapeCsvCell("  =1+1")).toBe("'  =1+1");
    expect(escapeCsvCell("\u00a0=1+1")).toBe("'\u00a0=1+1");
    expect(escapeCsvCell("\ufeff=1+1")).toBe("'\ufeff=1+1");
  });

  it("quotes commas, quotes, carriage returns, and line feeds", () => {
    expect(escapeCsvCell('hello, "world"\r\nnext')).toBe(
      '"hello, ""world""\r\nnext"'
    );
  });

  it("preserves empty and scalar cells and supports stable always-quoted exports", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(false)).toBe("false");
    expect(escapeCsvCell("plain", { alwaysQuote: true })).toBe('"plain"');
  });
});
