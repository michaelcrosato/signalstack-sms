import { describe, expect, it } from "vitest";
import { fingerprintSecret, getCredentialHistoryAction, redactValue } from "@/lib/db/repositories/provider-credentials";
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

  it("classifies credential history actions without exposing token values", () => {
    const created = {
      id: "cred_1",
      orgId: "org_1",
      provider: "twilio",
      accountSidRedacted: "redacted_7890",
      accountSidLast4: "7890",
      authTokenFingerprint: "fingerprint_1",
      authTokenConfigured: true,
      fromNumberRedacted: "redacted_0199",
      fromNumberLast4: "0199",
      source: "local_metadata",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    };
    const rotated = {
      ...created,
      authTokenFingerprint: "fingerprint_2",
      fromNumberRedacted: "redacted_0200",
      fromNumberLast4: "0200"
    };

    expect(getCredentialHistoryAction(null, created)).toBe("CONFIGURED");
    expect(getCredentialHistoryAction(created, created)).toBe("REFRESHED");
    expect(getCredentialHistoryAction(created, rotated)).toBe("ROTATED");
  });
});
