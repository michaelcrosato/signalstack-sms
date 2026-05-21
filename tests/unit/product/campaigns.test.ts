import { CampaignStatus, ConsentStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getProductCampaigns } from "@/lib/product/campaigns";

vi.mock("@/lib/db/repositories/campaigns", () => ({
  listCampaigns: vi.fn(async () => [
    {
      id: "campaign_1",
      name: "Welcome",
      status: CampaignStatus.DRAFT,
      scheduledAt: null,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      template: { name: "Intro" },
      recipients: [{ contactId: "contact_1" }]
    },
    {
      id: "campaign_2",
      name: "Reminder",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: new Date("2026-01-03T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      template: null,
      recipients: []
    }
  ])
}));

vi.mock("@/lib/db/repositories/contacts", () => ({
  listContacts: vi.fn(async () => [
    {
      id: "contact_1",
      displayName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+15555550100",
      consentStatus: ConsentStatus.OPTED_IN,
      archivedAt: null
    },
    {
      id: "contact_2",
      displayName: null,
      firstName: "Grace",
      lastName: "Hopper",
      phone: "+15555550101",
      consentStatus: ConsentStatus.OPTED_OUT,
      archivedAt: null
    }
  ])
}));

vi.mock("@/lib/db/repositories/templates", () => ({
  listTemplates: vi.fn(async () => [{ id: "template_1", name: "Intro", body: "Hi {{firstName}}" }])
}));

describe("getProductCampaigns", () => {
  it("builds campaign workspace rows and only counts opted-in active recipients as ready", async () => {
    const result = await getProductCampaigns("org_1");

    expect(result.summary).toEqual({
      total: 2,
      draft: 1,
      scheduled: 1,
      readyRecipients: 1
    });
    expect(result.campaigns.map((campaign) => campaign.templateName)).toEqual(["Intro", "Custom copy"]);
    expect(result.contacts).toEqual([
      {
        id: "contact_1",
        displayName: "Ada Lovelace",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        disabled: false
      },
      {
        id: "contact_2",
        displayName: "Grace Hopper",
        phone: "+15555550101",
        consentStatus: ConsentStatus.OPTED_OUT,
        disabled: true
      }
    ]);
    expect(result.templates).toEqual([{ id: "template_1", name: "Intro", body: "Hi {{firstName}}" }]);
  });
});
