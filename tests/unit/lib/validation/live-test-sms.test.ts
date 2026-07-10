import { describe, it, expect } from "vitest";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

describe("liveTestSmsSchema", () => {
  it("should accept valid input", () => {
    const validData = {
      to: "+1234567890",
      body: "This is a test message",
      confirmation: "Yes, send it",
    };

    const result = liveTestSmsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should trim whitespace from all string fields", () => {
    const dataWithSpaces = {
      to: "  +1234567890  ",
      body: "  Hello World  ",
      confirmation: "  Confirm  ",
    };

    const result = liveTestSmsSchema.safeParse(dataWithSpaces);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.to).toBe("+1234567890");
      expect(result.data.body).toBe("Hello World");
      expect(result.data.confirmation).toBe("Confirm");
    }
  });

  it("should reject 'to' field with length less than 5", () => {
    const data = {
      to: "1234",
      body: "Test message",
      confirmation: "Confirm",
    };

    const result = liveTestSmsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("should reject 'to' field with length more than 32", () => {
    const data = {
      to: "1".repeat(33),
      body: "Test message",
      confirmation: "Confirm",
    };

    const result = liveTestSmsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("should reject empty 'body' field", () => {
    const data = {
      to: "+1234567890",
      body: "",
      confirmation: "Confirm",
    };

    const result = liveTestSmsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("should reject 'body' field with length more than 320", () => {
    const data = {
      to: "+1234567890",
      body: "A".repeat(321),
      confirmation: "Confirm",
    };

    const result = liveTestSmsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("should reject empty 'confirmation' field", () => {
    const data = {
      to: "+1234567890",
      body: "Test message",
      confirmation: "",
    };

    const result = liveTestSmsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("should reject 'confirmation' field with length more than 80", () => {
    const data = {
      to: "+1234567890",
      body: "Test message",
      confirmation: "C".repeat(81),
    };

    const result = liveTestSmsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("should reject missing fields", () => {
    const result1 = liveTestSmsSchema.safeParse({ body: "Test", confirmation: "Confirm" });
    expect(result1.success).toBe(false);

    const result2 = liveTestSmsSchema.safeParse({ to: "+12345", confirmation: "Confirm" });
    expect(result2.success).toBe(false);

    const result3 = liveTestSmsSchema.safeParse({ to: "+12345", body: "Test" });
    expect(result3.success).toBe(false);
  });
});
