import { describe, expect, it } from "vitest";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

describe("liveTestSmsSchema validation", () => {
  it("accepts valid input", () => {
    expect(
      liveTestSmsSchema.parse({
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "yes",
      })
    ).toEqual({
      to: "+1234567890",
      body: "Hello, this is a test.",
      confirmation: "yes",
    });
  });

  it("trims whitespace from inputs", () => {
    expect(
      liveTestSmsSchema.parse({
        to: "  +1234567890  ",
        body: "  Hello, this is a test.  ",
        confirmation: "  yes  ",
      })
    ).toEqual({
      to: "+1234567890",
      body: "Hello, this is a test.",
      confirmation: "yes",
    });
  });

  it("rejects 'to' that is too short", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        to: "1234",
        body: "Hello, this is a test.",
        confirmation: "yes",
      })
    ).toThrow();
  });

  it("rejects 'to' that is too long", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        to: "1".repeat(33),
        body: "Hello, this is a test.",
        confirmation: "yes",
      })
    ).toThrow();
  });

  it("rejects 'body' that is empty after trim", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        to: "+1234567890",
        body: "   ",
        confirmation: "yes",
      })
    ).toThrow();
  });

  it("rejects 'body' that is too long", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        to: "+1234567890",
        body: "a".repeat(321),
        confirmation: "yes",
      })
    ).toThrow();
  });

  it("rejects 'confirmation' that is empty after trim", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "   ",
      })
    ).toThrow();
  });

  it("rejects 'confirmation' that is too long", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "a".repeat(81),
      })
    ).toThrow();
  });
});
