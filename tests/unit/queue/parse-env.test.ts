import { describe, expect, it } from "vitest";
import { positiveIntFromEnv } from "@/lib/queue/parse-env";

describe("positiveIntFromEnv", () => {
  it("parses a valid positive integer", () => {
    expect(positiveIntFromEnv("45000", 30000)).toBe(45000);
  });

  it("falls back for missing, non-numeric, zero, or negative values", () => {
    expect(positiveIntFromEnv(undefined, 30000)).toBe(30000);
    expect(positiveIntFromEnv("", 30000)).toBe(30000);
    expect(positiveIntFromEnv("not-a-number", 30000)).toBe(30000);
    expect(positiveIntFromEnv("0", 30000)).toBe(30000);
    expect(positiveIntFromEnv("-5", 30000)).toBe(30000);
  });
});
