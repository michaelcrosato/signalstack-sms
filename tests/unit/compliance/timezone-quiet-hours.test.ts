import { A2pRegistrationStatus, ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { resolveTimezoneFromPhone } from "@/lib/compliance/area-codes";
import { evaluateMessagingHardGate } from "@/lib/compliance/gates";

// America/Los_Angeles is PDT (UTC-7) in June.
// America/New_York is EDT (UTC-4) in June.
// America/Chicago is CDT (UTC-5) in June.
// America/Denver is MDT (UTC-6) in June.

const at = (utc: string) => new Date(utc);

describe("Timezone Area Code Resolver", () => {
  it("resolves major US timezones correctly from E.164 phone formats", () => {
    expect(resolveTimezoneFromPhone("+14155550199")).toBe("America/Los_Angeles"); // SF
    expect(resolveTimezoneFromPhone("+12125550199")).toBe("America/New_York");    // NY
    expect(resolveTimezoneFromPhone("+13125550199")).toBe("America/Chicago");     // Chicago
    expect(resolveTimezoneFromPhone("+13035550199")).toBe("America/Denver");      // Denver
  });

  it("resolves major US timezones correctly from raw 10-digit formats", () => {
    expect(resolveTimezoneFromPhone("4155550199")).toBe("America/Los_Angeles");
    expect(resolveTimezoneFromPhone("2125550199")).toBe("America/New_York");
  });

  it("gracefully defaults to America/New_York for unrecognized or international area codes", () => {
    expect(resolveTimezoneFromPhone("+19995550199")).toBe("America/New_York");
    expect(resolveTimezoneFromPhone("+447700900077")).toBe("America/New_York");
    expect(resolveTimezoneFromPhone("")).toBe("America/New_York");
  });
});

describe("Timezone-Scoped Dynamic Quiet-Hour Dispatcher", () => {
  const baseReadyInput = {
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
    }
  } as const;

  it("blocks sends to a contact whose dynamic timezone is in quiet hours", () => {
    // 2026-06-01T11:30:00Z is:
    // - 07:30 EDT (America/New_York) -> Quiet hour!
    // - 04:30 PDT (America/Los_Angeles) -> Quiet hour!
    // Let's test a contact with NY area code (+1212)
    const resultNY = evaluateMessagingHardGate({
      ...baseReadyInput,
      contact: {
        phone: "+12125550100",
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date(),
        consentMethod: "web_form",
        consentDisclosure: "I consent"
      },
      quietHours: { now: at("2026-06-01T11:30:00Z"), timeZone: "America/Los_Angeles" } // Explicit TZ is LA, but contact phone is NY
    });

    expect(resultNY.allowed).toBe(false);
    expect(resultNY.reasons).toContain("QUIET_HOURS");
  });

  it("allows sends to a contact whose dynamic timezone is active, even if explicitly passed timezone is in quiet hours", () => {
    // 2026-06-01T13:30:00Z is:
    // - 09:30 EDT (America/New_York) -> Active!
    // - 06:30 PDT (America/Los_Angeles) -> Quiet hour!
    // Contact phone is NY (+1212), so resolved TZ is NY. It should be ALLOWED because NY is 09:30.
    const result = evaluateMessagingHardGate({
      ...baseReadyInput,
      contact: {
        phone: "+12125550100",
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date(),
        consentMethod: "web_form",
        consentDisclosure: "I consent"
      },
      quietHours: { now: at("2026-06-01T13:30:00Z"), timeZone: "America/Los_Angeles" } // Explicit TZ is LA (quiet), but contact overrides to NY (allowed)
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("enforces contact-state quiet-hour overrides", () => {
    // 2026-06-02T03:00:00Z is:
    // - 20:00 PDT (America/Los_Angeles) -> default allows (until 21:00)
    // - Florida override says quiet hours start at 20:00!
    // Contact has +1415 (LA timezone) but state is "FL".
    const resultFL = evaluateMessagingHardGate({
      ...baseReadyInput,
      contact: {
        phone: "+14155550100",
        state: "FL",
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date(),
        consentMethod: "web_form",
        consentDisclosure: "I consent"
      },
      quietHours: { now: at("2026-06-02T03:00:00Z"), timeZone: "America/Los_Angeles" }
    });

    expect(resultFL.allowed).toBe(false);
    expect(resultFL.reasons).toContain("QUIET_HOURS");
  });
});
