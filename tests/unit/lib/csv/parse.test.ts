import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv/parse";

describe("parseCsv", () => {
  it("parses basic csv correctly", () => {
    const input = "Name,Age,City\nAlice,30,New York\nBob,25,London";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Alice", age: "30", city: "New York" },
      { name: "Bob", age: "25", city: "London" }
    ]);
  });

  it("handles empty input", () => {
    const input = "";
    const result = parseCsv(input);
    expect(result).toEqual([]);
  });

  it("handles empty rows and ignores them", () => {
    const input = "Name,Age,City\nAlice,30,New York\n\nBob,25,London\n\n";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Alice", age: "30", city: "New York" },
      { name: "Bob", age: "25", city: "London" }
    ]);
  });

  it("normalizes headers", () => {
    const input = "First Name!, Age (years),  City \nAlice,30,New York";
    const result = parseCsv(input);
    expect(result).toEqual([
      { first_name: "Alice", age_years: "30", city: "New York" }
    ]);
  });

  it("handles quoted strings with commas and new lines", () => {
    const input = "name,description\nAlice,\"Loves coding,\nand reading\"\nBob,\"Just, Bob\"";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Alice", description: "Loves coding,\nand reading" },
      { name: "Bob", description: "Just, Bob" }
    ]);
  });

  it("handles escaped quotes inside quotes", () => {
    const input = "name,quote\nAlice,\"She said \"\"hello\"\" to me\"";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Alice", quote: "She said \"hello\" to me" }
    ]);
  });

  it("handles windows style line endings", () => {
    const input = "Name,Age\r\nAlice,30\r\nBob,25";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" }
    ]);
  });

  it("handles trailing spaces in cells without quotes", () => {
    const input = "name,age\n Alice , 30 \nBob,25";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" }
    ]);
  });

  it("handles missing values in a row gracefully", () => {
    const input = "name,age,city\nAlice,30\nBob,,London";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Alice", age: "30", city: "" },
      { name: "Bob", age: "", city: "London" }
    ]);
  });
});
