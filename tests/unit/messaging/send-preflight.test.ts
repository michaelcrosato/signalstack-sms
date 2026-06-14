import { ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";

describe("campaign preflight", () => {
  it("allows only opted-in active contacts", () => {
    const result = preflightCampaignRecipients([
      {
        id: "contact_allowed",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null
      },
      {
        id: "contact_blocked",
        phone: "+15555550101",
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: new Date("2026-01-02T00:00:00.000Z"),
        archivedAt: null
      }
    ]);

    expect(result.allowed).toBe(false);
    expect(result.allowedRecipients).toBe(1);
    expect(result.blockedRecipients).toBe(1);
    expect(result.recipients[1].reasons).toContain("CONTACT_OPTED_OUT");
  });

  it("blocks empty recipient sets", () => {
    expect(preflightCampaignRecipients([])).toMatchObject({
      allowed: false,
      totalRecipients: 0
    });
  });

  it("blocks selected contact IDs that were not found in the current tenant", () => {
    const result = preflightCampaignRecipients(
      [
        {
          id: "contact_allowed",
          phone: "+15555550100",
          consentStatus: ConsentStatus.OPTED_IN,
          optedOutAt: null,
          archivedAt: null
        }
      ],
      ["contact_allowed", "contact_foreign", "contact_foreign"]
    );

    expect(result).toMatchObject({
      allowed: false,
      totalRecipients: 2,
      allowedRecipients: 1,
      blockedRecipients: 1
    });
    expect(result.recipients).toEqual([
      {
        contactId: "contact_allowed",
        phone: "+15555550100",
        allowed: true,
        reasons: []
      },
      {
        contactId: "contact_foreign",
        phone: "unknown",
        allowed: false,
        reasons: ["CONTACT_NOT_FOUND"]
      }
    ]);
  });
});
