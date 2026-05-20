import { A2pRegistrationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getProviderSettings } from "@/lib/messaging/provider/settings";

const completeProfile = {
  id: "profile_1",
  orgId: "org_1",
  businessName: "SignalStack Demo Co",
  messagingUseCase: "Marketing updates",
  optInDescription: "Website form",
  privacyPolicyUrl: "https://example.com/privacy",
  termsOfServiceUrl: "https://example.com/terms",
  a2pRegistrationStatus: A2pRegistrationStatus.APPROVED,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("provider settings", () => {
  it("keeps dummy demo mode blocked by default", () => {
    const settings = getProviderSettings({
      demoMode: true,
      liveMessagingEnabled: false,
      messagingProvider: "dummy",
      complianceProfile: null,
      env: {}
    });

    expect(settings.liveMessagingAllowed).toBe(false);
    expect(settings.blockers).toEqual(
      expect.arrayContaining(["LIVE_MESSAGING_DISABLED", "DEMO_MODE_ENABLED", "DUMMY_PROVIDER_SELECTED"])
    );
  });

  it("reports Twilio credential readiness without exposing secret values", () => {
    const settings = getProviderSettings({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      env: {
        TWILIO_ACCOUNT_SID: "AC_test",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_FROM_NUMBER: "+15555550199"
      }
    });

    expect(settings.liveMessagingAllowed).toBe(true);
    expect(settings.twilio).toEqual({
      accountSidConfigured: true,
      authTokenConfigured: true,
      fromNumberConfigured: true,
      configured: true,
      source: "environment",
      accountSidRedacted: null,
      fromNumberRedacted: null
    });
    expect(JSON.stringify(settings)).not.toContain("secret");
  });

  it("blocks Twilio readiness when credential presence is incomplete", () => {
    const settings = getProviderSettings({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      env: {
        TWILIO_ACCOUNT_SID: "AC_test"
      }
    });

    expect(settings.liveMessagingAllowed).toBe(false);
    expect(settings.blockers).toContain("TWILIO_CREDENTIALS_INCOMPLETE");
  });

  it("uses local credential metadata for readiness without exposing raw values", () => {
    const settings = getProviderSettings({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      providerCredential: {
        id: "cred_1",
        orgId: "org_1",
        provider: "twilio",
        accountSidRedacted: "redacted_7890",
        accountSidLast4: "7890",
        authTokenFingerprint: "abc123",
        authTokenConfigured: true,
        fromNumberRedacted: "redacted_0199",
        fromNumberLast4: "0199",
        source: "local_metadata",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      },
      env: {}
    });

    expect(settings.liveMessagingAllowed).toBe(true);
    expect(settings.twilio.configured).toBe(true);
    expect(settings.twilio.source).toBe("local_metadata");
    expect(JSON.stringify(settings)).not.toContain("abc123");
  });
});
