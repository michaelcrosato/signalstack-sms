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
          archivedAt: null,
          consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
          consentMethod: "web_form",
          consentDisclosure: "I agree to receive texts. Msg&data rates may apply. Reply STOP to opt out."
        }
      })
    ).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks an opted-in contact that lacks stored consent evidence", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: { consentStatus: ConsentStatus.OPTED_IN, optedOutAt: null, archivedAt: null }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["CONSENT_EVIDENCE_MISSING"]);
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

  it("blocks if contact is archived", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: new Date("2026-01-01T00:00:00.000Z"),
        consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "I agree"
      }
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["CONTACT_ARCHIVED"]);
  });

  it("blocks if contact consent is pending double opt-in", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "I agree"
      }
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["PENDING_DOUBLE_OPT_IN"]);
  });

  it("applies quiet hours logic correctly (blocked)", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "I agree",
        phone: "+12135550100" // 213 is LA (America/Los_Angeles)
      },
      quietHours: {
        now: new Date("2026-06-01T10:00:00Z"), // 03:00 PDT -> Blocked
        timeZone: "UTC" // Should be overridden by resolveTimezoneFromPhone
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["QUIET_HOURS"]);
  });



  it("uses contact state for quiet hours if provided", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "I agree",
        state: "IN",
        phone: null
      },
      quietHours: {
        now: new Date("2026-06-01T12:00:00Z"), // 08:00 EDT -> Generally allowed, but IN requires 09:00 -> Blocked
        timeZone: "America/New_York"
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["QUIET_HOURS"]);
  });

  it("resolves timezone correctly when state is not provided", () => {
    // A test that triggers the state branch when state is not provided
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "I agree",
        phone: "+12135550100" // CA (America/Los_Angeles)
      },
      quietHours: {
        now: new Date("2026-06-01T15:00:00Z"), // 08:00 PDT -> Allowed
        timeZone: "UTC",
        state: "WA" // Provide state in quietHours but NO state in contact to test the fallback.
      }
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

});
