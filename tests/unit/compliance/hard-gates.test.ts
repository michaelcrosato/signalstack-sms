import { A2pRegistrationStatus, ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";

const completeProfile = {
  businessName: "SignalStack Demo Co",
  messagingUseCase: "Marketing updates to opted-in contacts.",
  optInDescription: "Contacts opt in through a demo form.",
  privacyPolicyUrl: "https://example.com/privacy",
  termsOfServiceUrl: "https://example.com/terms",
  a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
};

describe("messaging hard gates", () => {
  it("blocks live messaging by default demo settings", () => {
    const result = evaluateMessagingHardGate({
      demoMode: true,
      liveMessagingEnabled: false,
      messagingProvider: "dummy",
      complianceProfile: null
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "LIVE_MESSAGING_DISABLED",
        "DEMO_MODE_ENABLED",
        "DUMMY_PROVIDER_SELECTED",
        "COMPLIANCE_PROFILE_INCOMPLETE",
        "A2P_NOT_APPROVED"
      ])
    );
  });

  it("allows only when live flags, provider, compliance, A2P, and consent are ready", () => {
    expect(
      evaluateMessagingHardGate({
        demoMode: false,
        liveMessagingEnabled: true,
        messagingProvider: "twilio",
        complianceProfile: completeProfile,
        contact: {
          consentStatus: ConsentStatus.OPTED_IN,
          optedOutAt: null,
          archivedAt: null
        }
      })
    ).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks opted-out contacts even when provider gates are otherwise ready", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: new Date("2026-01-01T00:00:00.000Z"),
        archivedAt: null
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["CONSENT_NOT_OPTED_IN", "CONTACT_OPTED_OUT"]));
  });

  it("reports compliance profile completeness separately from approval", () => {
    expect(complianceProfileIsComplete({ ...completeProfile, a2pRegistrationStatus: A2pRegistrationStatus.PENDING })).toBe(
      true
    );
    expect(complianceProfileIsComplete({ ...completeProfile, privacyPolicyUrl: null })).toBe(false);
  });
});
