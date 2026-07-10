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

  it("blocks contacts that are archived", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: new Date(),
        consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "I agree to receive texts. Msg&data rates may apply. Reply STOP to opt out."
      }
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["CONTACT_ARCHIVED"]);
  });

  it("blocks contacts with pending double opt-in", () => {
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
        consentDisclosure: "I agree to receive texts. Msg&data rates may apply. Reply STOP to opt out."
      }
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["PENDING_DOUBLE_OPT_IN"]);
  });

  describe("quiet hours", () => {
    it("allows sending during valid hours", () => {
      // Assuming America/New_York and time is 12:00 PM (12) -> allowed
      // The localHourInTimeZone needs to return an allowed hour
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
          consentDisclosure: "I agree to receive texts. Msg&data rates may apply. Reply STOP to opt out.",
          phone: "+12125551234" // NY area code
        },
        quietHours: {
          now: new Date("2023-01-01T17:00:00Z"), // 12 PM EST
          timeZone: "America/Chicago" // Should be overridden by contact phone
        }
      });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("blocks sending during quiet hours", () => {
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
          consentDisclosure: "I agree to receive texts. Msg&data rates may apply. Reply STOP to opt out.",
          phone: "+12125551234", // NY area code
          state: "FL" // Override state
        },
        quietHours: {
          now: new Date("2023-01-01T06:00:00Z"), // 1 AM EST -> Quiet Hours
          timeZone: "America/Chicago"
        }
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toEqual(["QUIET_HOURS"]);
    });

    it("uses default quiet hours info if contact has no phone or state", () => {
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
              consentDisclosure: "I agree to receive texts. Msg&data rates may apply. Reply STOP to opt out.",
            },
            quietHours: {
              now: new Date("2023-01-01T06:00:00Z"), // 1 AM EST -> Quiet Hours
              timeZone: "America/New_York",
              state: "NY"
            }
          });
          expect(result.allowed).toBe(false);
          expect(result.reasons).toEqual(["QUIET_HOURS"]);
    });
  });
});

  describe("hasConsentEvidence", () => {
    it("returns true when all required fields are present", () => {
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
            consentDisclosure: "disclosure"
          }
        }).reasons
      ).not.toContain("CONSENT_EVIDENCE_MISSING");
    });
  });
