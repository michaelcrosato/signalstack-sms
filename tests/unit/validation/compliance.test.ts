import { describe, expect, it } from "vitest";
import { complianceProfileUpdateSchema } from "@/lib/validation/compliance";
import { A2pRegistrationStatus } from "@prisma/client";

describe("compliance validation", () => {
  it("accepts a valid compliance profile update", () => {
    const validUpdate = {
      businessName: "Acme Corp",
      messagingUseCase: "Sending order updates to customers",
      optInDescription: "Customers opt-in during checkout",
      privacyPolicyUrl: "https://acme.com/privacy",
      termsOfServiceUrl: "https://acme.com/terms",
      a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
    };

    expect(complianceProfileUpdateSchema.parse(validUpdate)).toMatchObject(validUpdate);
  });

  it("accepts partial updates", () => {
    const partialUpdate = {
      businessName: "Acme Corp"
    };

    expect(complianceProfileUpdateSchema.parse(partialUpdate)).toMatchObject(partialUpdate);
  });

  it("rejects invalid URLs", () => {
    const invalidUpdate = {
      privacyPolicyUrl: "not-a-url"
    };

    expect(() => complianceProfileUpdateSchema.parse(invalidUpdate)).toThrow();
  });

  it("rejects strings that are too long for short text", () => {
    const invalidUpdate = {
      businessName: "a".repeat(161)
    };

    expect(() => complianceProfileUpdateSchema.parse(invalidUpdate)).toThrow();
  });

  it("rejects strings that are too long for regular text", () => {
    const invalidUpdate = {
      messagingUseCase: "a".repeat(1001)
    };

    expect(() => complianceProfileUpdateSchema.parse(invalidUpdate)).toThrow();
  });

  it("rejects empty strings for text fields due to min(1)", () => {
    const invalidUpdate = {
      businessName: ""
    };

    expect(() => complianceProfileUpdateSchema.parse(invalidUpdate)).toThrow();
  });

  it("rejects invalid A2P registration status", () => {
    const invalidUpdate = {
      a2pRegistrationStatus: "INVALID_STATUS"
    };

    expect(() => complianceProfileUpdateSchema.parse(invalidUpdate)).toThrow();
  });
});
