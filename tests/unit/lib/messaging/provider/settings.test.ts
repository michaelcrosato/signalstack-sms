import { describe, expect, it } from "vitest";
import { getProviderSettings, type ProviderSettingsInput } from "@/lib/messaging/provider/settings";
import { A2pRegistrationStatus } from "@prisma/client";

describe("getProviderSettings", () => {
  const baseInput: ProviderSettingsInput = {
    demoMode: false,
    liveMessagingEnabled: true,
    messagingProvider: "twilio",
    env: {}
  };

  it("should return false for configured if no credentials provided", () => {
    const result = getProviderSettings(baseInput);
    expect(result.twilio.configured).toBe(false);
    expect(result.twilio.source).toBe("environment");
    expect(result.liveMessagingAllowed).toBe(false);
  });

  it("should detect twilio configured via environment", () => {
    const input: ProviderSettingsInput = {
      ...baseInput,
      env: {
        TWILIO_ACCOUNT_SID: "sid",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_FROM_NUMBER: "+1234567890"
      }
    };

    const result = getProviderSettings(input);
    expect(result.twilio.configured).toBe(true);
    expect(result.twilio.source).toBe("environment");
  });

  it("should detect twilio configured via metadata", () => {
    const input: ProviderSettingsInput = {
      ...baseInput,
      providerCredential: {
        id: "cred_1",
        orgId: "org_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        provider: "twilio",
        source: "local_metadata",
        accountSidRedacted: "AC***123",
        authTokenConfigured: true,
        fromNumberRedacted: "+123***890", accountSidLast4: "123", authTokenFingerprint: "fingerprint", fromNumberLast4: "890"
      }
    };

    const result = getProviderSettings(input);
    expect(result.twilio.configured).toBe(true);
    expect(result.twilio.source).toBe("local_metadata");
  });

  it("should add blocker if twilio provider selected but not configured", () => {
    const result = getProviderSettings(baseInput);
    expect(result.blockers).toContain("TWILIO_CREDENTIALS_INCOMPLETE");
  });

  it("should map compliance profile data correctly", () => {
    const input: ProviderSettingsInput = {
      ...baseInput,
      complianceProfile: {
        id: "comp_1",
        orgId: "org_1",
        businessName: "Acme Corp",
        messagingUseCase: "Marketing",
        optInDescription: "Users opt in via web form",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

    const result = getProviderSettings(input);
    expect(result.compliance.complete).toBe(true);
    expect(result.compliance.a2pRegistrationStatus).toBe(A2pRegistrationStatus.APPROVED);
  });

  it("should map incomplete compliance profile correctly", () => {
    const input: ProviderSettingsInput = {
      ...baseInput,
      complianceProfile: null
    };

    const result = getProviderSettings(input);
    expect(result.compliance.complete).toBe(false);
    expect(result.compliance.a2pRegistrationStatus).toBe(A2pRegistrationStatus.NOT_STARTED);
  });

  it("should compute liveMessagingAllowed correctly based on hard gates and twilio config", () => {
    const input: ProviderSettingsInput = {
      ...baseInput,
      // Fully complete compliance profile
      complianceProfile: {
        id: "comp_1",
        orgId: "org_1",
        businessName: "Acme Corp",
        messagingUseCase: "Marketing",
        optInDescription: "Users opt in via web form",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      // Configured via environment
      env: {
        TWILIO_ACCOUNT_SID: "sid",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_FROM_NUMBER: "+1234567890"
      }
    };

    const result = getProviderSettings(input);
    // Should be allowed because hard gates pass (not demo mode, live enabled, etc.) and twilio is configured
    expect(result.liveMessagingAllowed).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("should not allow live messaging if twilio is not configured but hard gates pass", () => {
    const input: ProviderSettingsInput = {
      ...baseInput,
      // Fully complete compliance profile
      complianceProfile: {
        id: "comp_1",
        orgId: "org_1",
        businessName: "Acme Corp",
        messagingUseCase: "Marketing",
        optInDescription: "Users opt in via web form",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      // Missing Twilio env
      env: {}
    };

    const result = getProviderSettings(input);
    // liveMessagingAllowed from gate is true, but since twilio is not configured, it fails the `&&` check
    expect(result.liveMessagingAllowed).toBe(false);
    expect(result.blockers).toContain("TWILIO_CREDENTIALS_INCOMPLETE");
  });
});
