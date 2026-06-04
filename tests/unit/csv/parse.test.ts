import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv/parse";

describe("parseCsv", () => {
  it("returns empty array for empty string", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("returns empty array for only headers", () => {
    expect(parseCsv("Name,Age,Email")).toEqual([]);
  });

  it("parses basic CSV correctly", () => {
    const input = "Name,Age,City\nAlice,30,New York\nBob,25,Los Angeles";
    expect(parseCsv(input)).toEqual([
      { name: "Alice", age: "30", city: "New York" },
      { name: "Bob", age: "25", city: "Los Angeles" },
    ]);
  });

  it("handles quoted fields with commas", () => {
    const input = 'Name,Location\nAlice,"New York, NY"';
    expect(parseCsv(input)).toEqual([
      { name: "Alice", location: "New York, NY" },
    ]);
  });

  it("handles quoted fields with quotes", () => {
    const input = 'Name,Quote\nAlice,"She said ""Hello"""';
    expect(parseCsv(input)).toEqual([
      { name: "Alice", quote: 'She said "Hello"' },
    ]);
  });

  it("handles quoted fields with newlines", () => {
    const input = 'Name,Bio\nAlice,"Line 1\nLine 2"';
    expect(parseCsv(input)).toEqual([
      { name: "Alice", bio: "Line 1\nLine 2" },
    ]);
  });

  it("filters out empty rows", () => {
    const input = "Name,Age\nAlice,30\n\nBob,25\n   ,   \n";
    expect(parseCsv(input)).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
  });

  it("handles missing cells", () => {
    const input = "Name,Age,City\nAlice,30\nBob";
    expect(parseCsv(input)).toEqual([
      { name: "Alice", age: "30", city: "" },
      { name: "Bob", age: "", city: "" },
    ]);
  });

  it("normalizes headers correctly", () => {
    const input = "  First Name  , %&*( Foo )*&^ ,  Age\nAlice,Bar,30";
    expect(parseCsv(input)).toEqual([
      { first_name: "Alice", foo: "Bar", age: "30" },
    ]);
  });

  it("ignores empty headers", () => {
    const input = "Name,,City\nAlice,30,New York";
    expect(parseCsv(input)).toEqual([
      { name: "Alice", city: "New York" },
    ]);
  });

  it("handles windows style CRLF newlines", () => {
    const input = "Name,Age\r\nAlice,30\r\nBob,25";
    expect(parseCsv(input)).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
  });
});
