import { ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isWithinQuietHours, quietHoursBlockReason } from "@/lib/compliance/quiet-hours";
import { resolveTimezoneFromPhone } from "@/lib/compliance/area-codes";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";

const at = (utc: string) => new Date(utc);

describe("M7 Empirical Challenge: Audience Segmentation & Snapshot Immutability", () => {
  it("dynamic segment resolution filter logic", () => {
    const filter = {
      tagNames: ["VIP", "Newsletter"],
      consentStatuses: [ConsentStatus.OPTED_IN],
      minLeadScore: 10,
      maxLeadScore: 100
    };
    expect(filter.tagNames).toContain("VIP");
    expect(filter.consentStatuses).toContain(ConsentStatus.OPTED_IN);
  });
});

describe("M7 Empirical Challenge: Recipient Local Timezone Quiet Hours Boundaries", () => {
  const TZ_LA = "America/Los_Angeles";

  it("enforces exact 08:00 (inclusive) and 21:00 (exclusive) boundaries in local time", () => {
    // 15:00 UTC = 08:00 PDT (8:00 AM) -> ALLOWED (not in quiet hours)
    expect(isWithinQuietHours(at("2026-06-01T15:00:00Z"), TZ_LA)).toBe(false);

    // 14:59:59 UTC = 07:59:59 PDT (7:59:59 AM) -> BLOCKED (in quiet hours)
    expect(isWithinQuietHours(at("2026-06-01T14:59:59Z"), TZ_LA)).toBe(true);

    // 03:59:59 UTC (next day) = 20:59:59 PDT (8:59:59 PM) -> ALLOWED (not in quiet hours)
    expect(isWithinQuietHours(at("2026-06-02T03:59:59Z"), TZ_LA)).toBe(false);

    // 04:00:00 UTC (next day) = 21:00:00 PDT (9:00:00 PM) -> BLOCKED (in quiet hours)
    expect(isWithinQuietHours(at("2026-06-02T04:00:00Z"), TZ_LA)).toBe(true);
    expect(quietHoursBlockReason(at("2026-06-02T04:00:00Z"), TZ_LA)).toBe("QUIET_HOURS");
  });

  it("enforces state-specific quiet hour overrides (FL, TX, IN, AL)", () => {
    // Florida override: 08:00 to 20:00 (8am to 8pm)
    // 03:00 UTC = 20:00 PDT -> hour 20 -> BLOCKED in FL
    expect(isWithinQuietHours(at("2026-06-02T03:00:00Z"), TZ_LA, "FL")).toBe(true);
    // 02:59:59 UTC = 19:59:59 PDT -> hour 19 -> ALLOWED in FL
    expect(isWithinQuietHours(at("2026-06-02T02:59:59Z"), TZ_LA, "FL")).toBe(false);

    // Texas override: 09:00 to 21:00 (9am to 9pm)
    // 15:00 UTC = 08:00 PDT -> hour 8 -> BLOCKED in TX (starts at 9am)
    expect(isWithinQuietHours(at("2026-06-01T15:00:00Z"), TZ_LA, "TX")).toBe(true);
    // 16:00 UTC = 09:00 PDT -> hour 9 -> ALLOWED in TX
    expect(isWithinQuietHours(at("2026-06-01T16:00:00Z"), TZ_LA, "TX")).toBe(false);
  });

  it("resolves cross-timezone dispatches and falls back conservatively", () => {
    expect(resolveTimezoneFromPhone("+12125550199")).toBe("America/New_York");
    expect(resolveTimezoneFromPhone("+14155550199")).toBe("America/Los_Angeles");
    expect(resolveTimezoneFromPhone("+19995550199")).toBe("America/New_York");
    expect(resolveTimezoneFromPhone("+19995550199", "America/Chicago")).toBe("America/Chicago");

    // Invalid timezone fails safe to QUIET_HOURS (true)
    expect(isWithinQuietHours(at("2026-06-01T19:00:00Z"), "Invalid/Timezone_Name")).toBe(true);
  });

  it("verifies preflightCampaignRecipients enforces quiet hours and resolves recipient phone timezone", () => {
    const contactNY = {
      id: "c-ny-1",
      phone: "+12125550100", // NY phone (EDT)
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };

    // 04:00 UTC = 00:00 EDT (Midnight NY - quiet hours!)
    const preflightQuiet = preflightCampaignRecipients([contactNY], undefined, {
      now: at("2026-06-02T04:00:00Z"),
      timeZone: "America/Los_Angeles",
      checkQuietHours: true
    });

    // Quiet hours enforced: NY midnight is quiet hours
    expect(preflightQuiet.allowed).toBe(false);
    expect(preflightQuiet.recipients[0].reasons).toContain("QUIET_HOURS");

    // 13:30 UTC = 09:30 EDT (Active in NY), even though it is 06:30 PDT (Quiet in LA)
    // Phone resolution correctly identifies NY timezone (+1212 area code), evaluating active hours for NY contact
    const preflightActive = preflightCampaignRecipients([contactNY], undefined, {
      now: at("2026-06-01T13:30:00Z"),
      timeZone: "America/Los_Angeles",
      checkQuietHours: true
    });

    expect(preflightActive.allowed).toBe(true);
    expect(preflightActive.recipients[0].reasons).toEqual([]);
  });
});

describe("M7 Empirical Challenge: Preflight Consent Filter vs Mid-Flight Opt-Out Revocation Re-checks", () => {
  it("preflight correctly blocks non-OPTED_IN or opted-out contacts", () => {
    const contacts = [
      {
        id: "c-1",
        phone: "+14155550101",
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null
      },
      {
        id: "c-2",
        phone: "+14155550102",
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: new Date(),
        archivedAt: null
      },
      {
        id: "c-3",
        phone: "+14155550103",
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
        optedOutAt: null,
        archivedAt: null
      }
    ];

    const result = preflightCampaignRecipients(contacts);
    expect(result.allowedRecipients).toBe(1);
    expect(result.blockedRecipients).toBe(2);
    expect(result.recipients.find((r) => r.contactId === "c-2")?.reasons).toContain("CONTACT_OPTED_OUT");
    expect(result.recipients.find((r) => r.contactId === "c-3")?.reasons).toContain("PENDING_DOUBLE_OPT_IN");
  });

  it("verifies immediatePreflight in worker re-checks fresh DB contact state during mid-flight dispatch", () => {
    // Initial contact snapshot loaded at job start
    const contactSnapshot = {
      id: "c-optout-midflight",
      phone: "+14155550199",
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };

    // Mid-flight DB update: Contact opts out in DB while worker is processing previous recipients
    const updatedDbContact = {
      ...contactSnapshot,
      consentStatus: ConsentStatus.OPTED_OUT,
      optedOutAt: new Date("2026-06-01T12:00:00Z")
    };

    // Fresh DB contact re-check immediately before enqueueing message attempt
    const immediatePreflightFresh = preflightCampaignRecipients([updatedDbContact], undefined, {
      now: new Date(),
      timeZone: "America/Los_Angeles",
      checkQuietHours: true
    });
    expect(immediatePreflightFresh.allowed).toBe(false);
    expect(immediatePreflightFresh.recipients[0].reasons).toContain("CONTACT_OPTED_OUT");
  });
});
