import { describe, expect, it } from "vitest";
import { escapeCsv } from "@/lib/csv/escape";

describe("escapeCsv", () => {
  it("escapes double quotes", () => {
    expect(escapeCsv('hello "world"')).toBe('"hello ""world"""');
  });

  it("quotes strings containing commas", () => {
    expect(escapeCsv("hello, world")).toBe('"hello, world"');
  });

  it("quotes strings containing newlines", () => {
    expect(escapeCsv("hello\nworld")).toBe('"hello\nworld"');
  });

  it("handles empty values correctly", () => {
    expect(escapeCsv("")).toBe("");
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });

  it("converts numbers and booleans to string", () => {
    expect(escapeCsv(123)).toBe("123");
    expect(escapeCsv(true)).toBe("true");
    expect(escapeCsv(false)).toBe("false");
  });

  describe("CSV Injection Prevention", () => {
    it("prefixes = with a single quote", () => {
      expect(escapeCsv("=1+1")).toBe("'=1+1");
    });

    it("prefixes + with a single quote", () => {
      expect(escapeCsv("+1+1")).toBe("'+1+1");
    });

    it("prefixes - with a single quote", () => {
      expect(escapeCsv("-1+1")).toBe("'-1+1");
    });

    it("prefixes @ with a single quote", () => {
      expect(escapeCsv("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    });

    it("prefixes tab with a single quote", () => {
      expect(escapeCsv("\t=1+1")).toBe("'\t=1+1");
    });

    it("prefixes carriage return with a single quote", () => {
      expect(escapeCsv("\r=1+1")).toBe("'\r=1+1");
    });

    it("quotes the string if it contains a comma and starts with a formula character", () => {
      expect(escapeCsv("=hello,world")).toBe("\"'=hello,world\"");
    });
  });
});
