import { describe, expect, it } from "vitest";
import { complianceProfileUpdateSchema } from "@/lib/validation/compliance";
import { A2pRegistrationStatus } from "@prisma/client";

describe("complianceProfileUpdateSchema", () => {
  it("validates a fully populated valid input", () => {
    const validData = {
      businessName: "Acme Corp",
      messagingUseCase: "Customer notifications and alerts",
      optInDescription: "Users opt in via our website form.",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
    };

    expect(complianceProfileUpdateSchema.parse(validData)).toEqual(validData);
  });

  it("validates an empty object (all fields are optional)", () => {
    expect(complianceProfileUpdateSchema.parse({})).toEqual({});
  });

  it("trims whitespace from string fields", () => {
    const paddedData = {
      businessName: "   Acme Corp   ",
      messagingUseCase: "  Notifications  ",
      privacyPolicyUrl: "  https://example.com/privacy  "
    };

    const result = complianceProfileUpdateSchema.parse(paddedData);
    expect(result.businessName).toBe("Acme Corp");
    expect(result.messagingUseCase).toBe("Notifications");
    expect(result.privacyPolicyUrl).toBe("https://example.com/privacy");
  });

  it("fails when URLs are invalid", () => {
    const invalidData = {
      privacyPolicyUrl: "not-a-url"
    };

    const result = complianceProfileUpdateSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid url");
    }
  });

  it("fails when businessName exceeds maximum length", () => {
    const invalidData = {
      businessName: "a".repeat(161) // max is 160
    };

    const result = complianceProfileUpdateSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/String must contain at most 160 character/);
    }
  });

  it("fails when messagingUseCase exceeds maximum length", () => {
    const invalidData = {
      messagingUseCase: "a".repeat(1001) // max is 1000
    };

    const result = complianceProfileUpdateSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/String must contain at most 1000 character/);
    }
  });

  it("fails when empty string is provided (due to min(1) and trimming)", () => {
    const invalidData = {
      businessName: "   " // trims to empty string, violates min(1)
    };

    const result = complianceProfileUpdateSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/String must contain at least 1 character/);
    }
  });

  it("fails when invalid enum value is provided for a2pRegistrationStatus", () => {
    const invalidData = {
      a2pRegistrationStatus: "INVALID_STATUS"
    };

    const result = complianceProfileUpdateSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
