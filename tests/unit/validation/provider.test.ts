import { describe, expect, it } from "vitest";
import { providerPhoneNumberSchema } from "@/lib/validation/provider";

describe("provider phone number validation", () => {
  it("defaults local numbers to the dummy provider and sms capability", () => {
    const parsed = providerPhoneNumberSchema.parse({
      phoneNumber: "+15555550123"
    });

    expect(parsed).toEqual({
      phoneNumber: "+15555550123",
      provider: "dummy",
      capabilities: ["sms"],
      isDefault: false
    });
  });

  it("rejects non-e164 phone numbers", () => {
    expect(() => providerPhoneNumberSchema.parse({ phoneNumber: "555-1234" })).toThrow();
  });
});
