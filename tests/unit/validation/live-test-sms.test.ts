import { describe, expect, it } from "vitest";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const operatorToken = "test-operator-token-32-characters-minimum";

describe("liveTestSmsSchema validation", () => {
  it("accepts valid input", () => {
    expect(
      liveTestSmsSchema.parse({
        requestId,
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "yes",
        operatorToken
      })
    ).toEqual({
      requestId,
      to: "+1234567890",
      body: "Hello, this is a test.",
      confirmation: "yes",
      operatorToken
    });
  });

  it("trims whitespace from inputs", () => {
    expect(
      liveTestSmsSchema.parse({
        requestId: `  ${requestId}  `,
        to: "  +1234567890  ",
        body: "  Hello, this is a test.  ",
        confirmation: "  yes  ",
        operatorToken
      })
    ).toEqual({
      requestId,
      to: "+1234567890",
      body: "Hello, this is a test.",
      confirmation: "yes",
      operatorToken
    });
  });

  it("rejects 'to' that is too short", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        requestId,
        to: "1234",
        body: "Hello, this is a test.",
        confirmation: "yes",
        operatorToken
      })
    ).toThrow();
  });

  it("rejects 'to' that is too long", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        requestId,
        to: "1".repeat(33),
        body: "Hello, this is a test.",
        confirmation: "yes",
        operatorToken
      })
    ).toThrow();
  });

  it("rejects 'body' that is empty after trim", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        requestId,
        to: "+1234567890",
        body: "   ",
        confirmation: "yes",
        operatorToken
      })
    ).toThrow();
  });

  it("rejects 'body' that is too long", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        requestId,
        to: "+1234567890",
        body: "a".repeat(321),
        confirmation: "yes",
        operatorToken
      })
    ).toThrow();
  });

  it("rejects 'confirmation' that is empty after trim", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        requestId,
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "   ",
        operatorToken
      })
    ).toThrow();
  });

  it("rejects 'confirmation' that is too long", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        requestId,
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "a".repeat(81),
        operatorToken
      })
    ).toThrow();
  });

  it.each([undefined, "too-short", "x".repeat(257)])("rejects an invalid operator token", (value) => {
    expect(() =>
      liveTestSmsSchema.parse({
        requestId,
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "yes",
        operatorToken: value
      })
    ).toThrow();
  });

  it("rejects missing or malformed request IDs", () => {
    expect(() =>
      liveTestSmsSchema.parse({
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "yes",
        operatorToken
      })
    ).toThrow();
    expect(() =>
      liveTestSmsSchema.parse({
        requestId: "retry-me",
        to: "+1234567890",
        body: "Hello, this is a test.",
        confirmation: "yes",
        operatorToken
      })
    ).toThrow();
  });
});
