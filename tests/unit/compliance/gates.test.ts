import { describe, expect, it } from "vitest";
import { A2pRegistrationStatus, ConsentStatus } from "@prisma/client";
import {
  evaluateMessagingHardGate,
  hasConsentEvidence,
  complianceProfileIsComplete,
  type MessagingHardGateInput,
} from "@/lib/compliance/gates";

describe("lib/compliance/gates", () => {
  const validProfile = {
    businessName: "Test Co",
    messagingUseCase: "Testing",
    optInDescription: "Opt in via test form",
    privacyPolicyUrl: "https://test.com/privacy",
    termsOfServiceUrl: "https://test.com/terms",
    a2pRegistrationStatus: A2pRegistrationStatus.APPROVED,
  };

  const validContact = {
    phone: "+15555555555",
    state: "NY",
    consentStatus: ConsentStatus.OPTED_IN,
    optedOutAt: null,
    archivedAt: null,
    consentCapturedAt: new Date("2024-01-01T00:00:00Z"),
    consentMethod: "web_form",
    consentDisclosure: "I consent to receive texts.",
  };

  const defaultInput: MessagingHardGateInput = {
    demoMode: false,
    liveMessagingEnabled: true,
    messagingProvider: "twilio",
    complianceProfile: validProfile,
    contact: validContact,
  };

  describe("evaluateMessagingHardGate", () => {
    it("should allow a fully valid input", () => {
      const result = evaluateMessagingHardGate(defaultInput);
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("should allow a valid input without a contact", () => {
      const result = evaluateMessagingHardGate({
        ...defaultInput,
        contact: null,
      });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("should allow a valid input without a contact but with quiet hours", () => {
      const result = evaluateMessagingHardGate({
        ...defaultInput,
        contact: null,
        quietHours: {
          now: new Date("2024-01-01T15:00:00Z"), // Will pass in UTC (8am - 9pm local time)
          timeZone: "America/Los_Angeles", // UTC-8 in Jan, so this is 7am local time (blocked) -> let's make it 18:00 UTC = 10:00 AM local
        },
      });
      expect(result.reasons).toContain("QUIET_HOURS");

      // The timezone is America/Los_Angeles, which is UTC-8 in standard time.
      // So 18:00 UTC = 10:00 AM local time. Quiet hours are 08:00 - 21:00.
      const result2 = evaluateMessagingHardGate({
        ...defaultInput,
        contact: null,
        quietHours: {
          now: new Date("2024-01-01T18:00:00Z"),
          timeZone: "America/Los_Angeles",
        },
      });
      expect(result2.allowed).toBe(true);
      expect(result2.reasons).toEqual([]);
    });

    it("should block if live messaging is disabled", () => {
      const result = evaluateMessagingHardGate({
        ...defaultInput,
        liveMessagingEnabled: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("LIVE_MESSAGING_DISABLED");
    });

    it("should block if demo mode is enabled", () => {
      const result = evaluateMessagingHardGate({
        ...defaultInput,
        demoMode: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("DEMO_MODE_ENABLED");
    });

    it("should block if dummy messaging provider is selected", () => {
      const result = evaluateMessagingHardGate({
        ...defaultInput,
        messagingProvider: "dummy",
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("DUMMY_PROVIDER_SELECTED");
    });

    it("should block if compliance profile is incomplete", () => {
      const result = evaluateMessagingHardGate({
        ...defaultInput,
        complianceProfile: {
          ...validProfile,
          businessName: "",
        },
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("COMPLIANCE_PROFILE_INCOMPLETE");
    });

    it("should block if A2P is not approved", () => {
      const result = evaluateMessagingHardGate({
        ...defaultInput,
        complianceProfile: {
          ...validProfile,
          a2pRegistrationStatus: A2pRegistrationStatus.PENDING,
        },
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("A2P_NOT_APPROVED");
    });

    describe("contact checks", () => {
      it("should block if contact is archived", () => {
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          contact: { ...validContact, archivedAt: new Date() },
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain("CONTACT_ARCHIVED");
      });

      it("should block if consent is PENDING_DOUBLE_OPT_IN", () => {
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          contact: {
            ...validContact,
            consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
          },
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain("PENDING_DOUBLE_OPT_IN");
      });

      it("should block if consent is NOT OPTED_IN", () => {
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          contact: {
            ...validContact,
            consentStatus: ConsentStatus.OPTED_OUT,
          },
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain("CONSENT_NOT_OPTED_IN");
      });

      it("should block if contact has opted out", () => {
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          contact: {
            ...validContact,
            optedOutAt: new Date(),
          },
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain("CONTACT_OPTED_OUT");
      });

      it("should block if consent evidence is missing", () => {
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          contact: {
            ...validContact,
            consentCapturedAt: null,
          },
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain("CONSENT_EVIDENCE_MISSING");
      });
    });

    describe("quiet hours", () => {
      it("should pass contact phone and state to quiet hours check", () => {
        // The test phone number is +15555555555, which is invalid for area code parsing and probably returns UTC.
        // Let's use a real area code like 212 (New York, America/New_York).
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          contact: {
            ...validContact,
            phone: "+12125555555",
            state: "NY",
          },
          quietHours: {
            now: new Date("2024-01-01T08:00:00Z"), // 3am EST (blocked)
            timeZone: "America/Los_Angeles", // Should be overridden by contact phone
          },
        });

        expect(result.reasons).toContain("QUIET_HOURS");
      });

      it("should fallback to input state and tz if contact is missing phone/state", () => {
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          contact: {
            ...validContact,
            phone: null,
            state: null,
          },
          quietHours: {
            now: new Date("2024-01-01T08:00:00Z"), // 12am PST (blocked)
            timeZone: "America/Los_Angeles",
            state: "NY",
          },
        });
        expect(result.reasons).toContain("QUIET_HOURS");
      });

      it("should pass if within quiet hours", () => {
        const result = evaluateMessagingHardGate({
          ...defaultInput,
          quietHours: {
            now: new Date("2024-01-01T17:00:00Z"), // 12pm EST (allowed)
            timeZone: "America/New_York",
          },
        });
        expect(result.allowed).toBe(true);
        expect(result.reasons).toEqual([]);
      });
    });
  });

  describe("hasConsentEvidence", () => {
    it("should return true when all evidence fields are present", () => {
      expect(hasConsentEvidence(validContact)).toBe(true);
    });

    it("should return false if consentCapturedAt is missing", () => {
      expect(
        hasConsentEvidence({ ...validContact, consentCapturedAt: null }),
      ).toBe(false);
    });

    it("should return false if consentMethod is missing", () => {
      expect(hasConsentEvidence({ ...validContact, consentMethod: null })).toBe(
        false,
      );
    });

    it("should return false if consentDisclosure is missing", () => {
      expect(
        hasConsentEvidence({ ...validContact, consentDisclosure: null }),
      ).toBe(false);
    });
  });

  describe("complianceProfileIsComplete", () => {
    it("should return true when all required fields are present", () => {
      expect(complianceProfileIsComplete(validProfile)).toBe(true);
    });

    it("should return false if profile is null", () => {
      expect(complianceProfileIsComplete(null)).toBe(false);
    });

    it("should return false if businessName is missing", () => {
      expect(
        complianceProfileIsComplete({ ...validProfile, businessName: "" }),
      ).toBe(false);
    });

    it("should return false if messagingUseCase is missing", () => {
      expect(
        complianceProfileIsComplete({ ...validProfile, messagingUseCase: "" }),
      ).toBe(false);
    });

    it("should return false if optInDescription is missing", () => {
      expect(
        complianceProfileIsComplete({ ...validProfile, optInDescription: "" }),
      ).toBe(false);
    });

    it("should return false if privacyPolicyUrl is missing", () => {
      expect(
        complianceProfileIsComplete({ ...validProfile, privacyPolicyUrl: "" }),
      ).toBe(false);
    });

    it("should return false if termsOfServiceUrl is missing", () => {
      expect(
        complianceProfileIsComplete({ ...validProfile, termsOfServiceUrl: "" }),
      ).toBe(false);
    });
  });
});
