import { A2pRegistrationStatus, ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { isWithinQuietHours, quietHoursBlockReason } from "@/lib/compliance/quiet-hours";

// America/Los_Angeles is UTC-7 in June (PDT), so local hour = UTC hour - 7.
const TZ = "America/Los_Angeles";
const at = (utc: string) => new Date(utc);

describe("quiet hours (TCPA 08:00–21:00 local)", () => {
  it("permits sending inside the window", () => {
    expect(isWithinQuietHours(at("2026-06-01T15:00:00Z"), TZ)).toBe(false); // 08:00 PDT (boundary, allowed)
    expect(isWithinQuietHours(at("2026-06-01T19:00:00Z"), TZ)).toBe(false); // 12:00 PDT
    expect(isWithinQuietHours(at("2026-06-02T03:30:00Z"), TZ)).toBe(false); // 20:30 PDT
  });

  it("blocks sending before 08:00 and at/after 21:00 local", () => {
    expect(isWithinQuietHours(at("2026-06-01T14:59:00Z"), TZ)).toBe(true); // 07:59 PDT
    expect(isWithinQuietHours(at("2026-06-02T04:00:00Z"), TZ)).toBe(true); // 21:00 PDT
    expect(quietHoursBlockReason(at("2026-06-02T04:00:00Z"), TZ)).toBe("QUIET_HOURS");
    expect(quietHoursBlockReason(at("2026-06-01T19:00:00Z"), TZ)).toBeNull();
  });

  it("fails safe (blocks) for an unresolvable timezone", () => {
    expect(isWithinQuietHours(at("2026-06-01T19:00:00Z"), "Not/AZone")).toBe(true);
  });
});

describe("messaging hard gate quiet-hours integration", () => {
  const ready = {
    demoMode: false,
    liveMessagingEnabled: true,
    messagingProvider: "twilio",
    complianceProfile: {
      businessName: "SignalStack Demo Co",
      messagingUseCase: "Marketing updates to opted-in contacts.",
      optInDescription: "Contacts opt in through a demo form.",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
    },
    contact: {
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null,
      consentCapturedAt: new Date("2026-01-01T00:00:00.000Z"),
      consentMethod: "web_form",
      consentDisclosure: "I agree to receive texts. Reply STOP to opt out."
    }
  } as const;

  it("adds QUIET_HOURS when an otherwise-ready send is outside the window", () => {
    const result = evaluateMessagingHardGate({
      ...ready,
      quietHours: { now: at("2026-06-01T14:00:00Z"), timeZone: TZ } // 07:00 PDT
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["QUIET_HOURS"]);
  });

  it("allows an otherwise-ready send inside the window", () => {
    const result = evaluateMessagingHardGate({
      ...ready,
      quietHours: { now: at("2026-06-01T19:00:00Z"), timeZone: TZ } // 12:00 PDT
    });
    expect(result).toEqual({ allowed: true, reasons: [] });
  });
});
