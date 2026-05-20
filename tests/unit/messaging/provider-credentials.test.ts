import { describe, expect, it } from "vitest";
import { fingerprintSecret, redactValue } from "@/lib/db/repositories/provider-credentials";
import { providerSettingsUpdateSchema } from "@/lib/validation/provider";

describe("provider credential metadata", () => {
  it("redacts identifiers and fingerprints tokens deterministically", () => {
    expect(redactValue("AC1234567890")).toBe("redacted_7890");
    expect(redactValue("+15555550199")).toBe("redacted_0199");
    expect(fingerprintSecret("demo_token_value")).toBe(fingerprintSecret("demo_token_value"));
    expect(fingerprintSecret("demo_token_value")).not.toContain("demo_token_value");
  });

  it("validates Twilio metadata inputs without accepting invalid from numbers", () => {
    expect(
      providerSettingsUpdateSchema.safeParse({
        provider: "twilio",
        twilio: {
          accountSid: "AC1234567890",
          authToken: "demo_token_value",
          fromNumber: "+15555550199"
        }
      }).success
    ).toBe(true);

    expect(
      providerSettingsUpdateSchema.safeParse({
        provider: "twilio",
        twilio: {
          accountSid: "AC1234567890",
          authToken: "demo_token_value",
          fromNumber: "555-0199"
        }
      }).success
    ).toBe(false);
  });
});
