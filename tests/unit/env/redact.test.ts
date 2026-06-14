import { describe, expect, it } from "vitest";
import { redactSecret } from "@/lib/env/redact";

describe("redactSecret utility", () => {
  it("handles blank (null, undefined, empty) values correctly", () => {
    expect(redactSecret(null)).toBe("");
    expect(redactSecret(undefined)).toBe("");
    expect(redactSecret("")).toBe("");
    expect(redactSecret("   ")).toBe("");
  });

  it("handles short secret strings correctly by returning 8 asterisks", () => {
    expect(redactSecret("123")).toBe("********");
    expect(redactSecret("1234567")).toBe("********");
    expect(redactSecret("  123  ")).toBe("********"); // after trimming, length is 3
  });

  it("handles standard secret strings correctly by masking all but the last 4 characters", () => {
    expect(redactSecret("12345678")).toBe("********5678");
    expect(redactSecret("my-super-secret-key-12345")).toBe("********2345");
  });
});
