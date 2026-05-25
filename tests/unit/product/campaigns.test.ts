import { CampaignRecipientStatus, CampaignStatus, ConsentStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { productCampaignComposerDefaults } from "@/lib/product/campaign-composer-defaults";
import {
  getProductCampaignDetail,
  getProductCampaigns,
  productCampaignDeliveryMetricRows,
  productCampaignDetailMetricRows,
  productCampaignMetricRows,
  productCampaignRecipientStatusRows
} from "@/lib/product/campaigns";

vi.mock("@/lib/db/repositories/campaigns", () => ({
  getCampaignWithMessages: vi.fn(async (_orgId: string, campaignId: string) =>
    campaignId === "missing"
      ? null
      : {
          id: campaignId,
          name: "Welcome",
          body: "Hi {{firstName}}",
          status: CampaignStatus.DRAFT,
          templateId: "template_1",
          scheduledAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          template: { name: "Intro" },
          recipients: [
            {
              contactId: "contact_1",
              status: CampaignRecipientStatus.PENDING,
              blockReason: null,
              contact: {
                id: "contact_1",
                displayName: "Ada Lovelace",
                firstName: "Ada",
                lastName: "Lovelace",
                phone: "+15555550100",
                consentStatus: ConsentStatus.OPTED_IN,
                archivedAt: null
              }
            }
          ],
          messages: [
            {
              id: "message_delivered",
              direction: "OUTBOUND",
              providerStatus: "delivered",
              providerMessageId: "dummy_message_1",
              deliveredAt: new Date("2026-01-03T00:00:00.000Z"),
              failedAt: null,
              createdAt: new Date("2026-01-02T00:00:00.000Z"),
              contact: {
                displayName: "Ada Lovelace",
                firstName: "Ada",
                lastName: "Lovelace",
                phone: "+15555550100"
              }
            },
            {
              id: "message_failed",
              direction: "OUTBOUND",
              providerStatus: "failed",
              providerMessageId: null,
              deliveredAt: null,
              failedAt: new Date("2026-01-04T00:00:00.000Z"),
              createdAt: new Date("2026-01-04T00:00:00.000Z"),
              contact: null
            },
            {
              id: "message_pending",
              direction: "OUTBOUND",
              providerStatus: "sent",
              providerMessageId: "dummy_message_2",
              deliveredAt: null,
              failedAt: null,
              createdAt: new Date("2026-01-04T12:00:00.000Z"),
              contact: {
                displayName: null,
                firstName: "Grace",
                lastName: "Hopper",
                phone: "+15555550101"
              }
            },
            {
              id: "message_inbound_delivered",
              direction: "INBOUND",
              providerStatus: "delivered",
              providerMessageId: "provider_inbound_delivered",
              deliveredAt: new Date("2026-01-05T00:00:00.000Z"),
              failedAt: null,
              createdAt: new Date("2026-01-05T00:00:00.000Z"),
              contact: null
            },
            {
              id: "message_inbound_failed",
              direction: "INBOUND",
              providerStatus: "failed",
              providerMessageId: "provider_inbound_failed",
              deliveredAt: null,
              failedAt: new Date("2026-01-06T00:00:00.000Z"),
              createdAt: new Date("2026-01-06T00:00:00.000Z"),
              contact: null
            }
          ]
        }
  ),
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
    expect(result.metrics).toEqual([
      { key: "total", label: "Total Campaigns", value: 2 },
      { key: "draft", label: "Drafts", value: 1 },
      { key: "scheduled", label: "Scheduled", value: 1 },
      { key: "readyRecipients", label: "Ready Recipients", value: 1 }
    ]);
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

  it("builds campaign detail rows for local edit and cancel workflow", async () => {
    const result = await getProductCampaignDetail("org_1", "campaign_1");

    expect(result).toMatchObject({
      id: "campaign_1",
      name: "Welcome",
      body: "Hi {{firstName}}",
      status: CampaignStatus.DRAFT,
      templateId: "template_1",
      templateName: "Intro",
      canEdit: true,
      canCancel: false,
      selectedContactIds: ["contact_1"]
    });
    expect(result?.metrics).toEqual([
      { key: "status", label: "Status", value: CampaignStatus.DRAFT },
      { key: "recipients", label: "Recipients", value: "1" },
      { key: "template", label: "Template", value: "Intro" },
      { key: "schedule", label: "Schedule", value: "Not scheduled" }
    ]);
    expect(result?.recipientRows).toEqual([
      {
        id: "contact_1",
        displayName: "Ada Lovelace",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        archived: false,
        sendState: CampaignRecipientStatus.PENDING,
        blockReason: null,
        statusRows: [
          { key: "consent", label: "Consent", value: ConsentStatus.OPTED_IN },
          { key: "archived", label: "Archive", value: "active" },
          { key: "sendState", label: "Send State", value: CampaignRecipientStatus.PENDING },
          { key: "blockReason", label: "Block Reason", value: "none" }
        ]
      }
    ]);
    expect(result?.deliveryMetrics).toEqual([
      { key: "outboundMessages", label: "Outbound Messages", value: "3" },
      { key: "delivered", label: "Delivered", value: "1" },
      { key: "pending", label: "Pending", value: "1" },
      { key: "failed", label: "Failed", value: "1" },
      { key: "providerStatuses", label: "Provider Statuses", value: "delivered, failed, sent" }
    ]);
    expect(result?.deliveryRows).toEqual([
      {
        id: "message_delivered",
        contactDisplayName: "Ada Lovelace",
        direction: "OUTBOUND",
        providerStatus: "delivered",
        providerMessageId: "dummy_message_1",
        createdAt: "2026-01-02T00:00:00.000Z",
        deliveredAt: "2026-01-03T00:00:00.000Z",
        failedAt: null
      },
      {
        id: "message_failed",
        contactDisplayName: "Unknown contact",
        direction: "OUTBOUND",
        providerStatus: "failed",
        providerMessageId: "no provider id",
        createdAt: "2026-01-04T00:00:00.000Z",
        deliveredAt: null,
        failedAt: "2026-01-04T00:00:00.000Z"
      },
      {
        id: "message_pending",
        contactDisplayName: "Grace Hopper",
        direction: "OUTBOUND",
        providerStatus: "sent",
        providerMessageId: "dummy_message_2",
        createdAt: "2026-01-04T12:00:00.000Z",
        deliveredAt: null,
        failedAt: null
      }
    ]);
    expect(result?.contacts.map((contact) => ({ id: contact.id, selected: contact.selected, disabled: contact.disabled }))).toEqual([
      { id: "contact_1", selected: true, disabled: false },
      { id: "contact_2", selected: false, disabled: true }
    ]);
  });

  it("returns null for missing campaign detail", async () => {
    await expect(getProductCampaignDetail("org_1", "missing")).resolves.toBeNull();
  });

  it("freezes campaign metric metadata before rendering", () => {
    expect(Object.isFrozen(productCampaignMetricRows)).toBe(true);
    expect(productCampaignMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productCampaignMetricRows.map((row) => row.key)).toEqual([
      "total",
      "draft",
      "scheduled",
      "readyRecipients"
    ]);

    expect(() =>
      (productCampaignMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productCampaignMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productCampaignMetricRows[0].label).toBe("Total Campaigns");
  });

  it("freezes campaign detail metric metadata before rendering", () => {
    expect(Object.isFrozen(productCampaignDetailMetricRows)).toBe(true);
    expect(productCampaignDetailMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productCampaignDetailMetricRows.map((row) => row.key)).toEqual([
      "status",
      "recipients",
      "template",
      "schedule"
    ]);

    expect(() =>
      (productCampaignDetailMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productCampaignDetailMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productCampaignDetailMetricRows[0].label).toBe("Status");
  });

  it("freezes campaign recipient snapshot metadata before rendering", () => {
    expect(Object.isFrozen(productCampaignRecipientStatusRows)).toBe(true);
    expect(productCampaignRecipientStatusRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productCampaignRecipientStatusRows.map((row) => row.key)).toEqual([
      "consent",
      "archived",
      "sendState",
      "blockReason"
    ]);
    expect(productCampaignRecipientStatusRows.map((row) => row.label)).toEqual([
      "Consent",
      "Archive",
      "Send State",
      "Block Reason"
    ]);

    expect(() =>
      (productCampaignRecipientStatusRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productCampaignRecipientStatusRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productCampaignRecipientStatusRows[0].label).toBe("Consent");
  });

  it("freezes campaign delivery metric metadata before rendering", () => {
    expect(Object.isFrozen(productCampaignDeliveryMetricRows)).toBe(true);
    expect(productCampaignDeliveryMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productCampaignDeliveryMetricRows.map((row) => row.key)).toEqual([
      "outboundMessages",
      "delivered",
      "pending",
      "failed",
      "providerStatuses"
    ]);
    expect(productCampaignDeliveryMetricRows.map((row) => row.label)).toEqual([
      "Outbound Messages",
      "Delivered",
      "Pending",
      "Failed",
      "Provider Statuses"
    ]);

    expect(() =>
      (productCampaignDeliveryMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productCampaignDeliveryMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productCampaignDeliveryMetricRows[0].label).toBe("Outbound Messages");
  });

  it("freezes campaign composer defaults before rendering the local composer", () => {
    expect(Object.isFrozen(productCampaignComposerDefaults)).toBe(true);
    expect(productCampaignComposerDefaults).toEqual({
      name: "Product demo campaign",
      body: "Hi {{firstName}}, this is SignalStack Demo Co. Reply STOP to opt out.",
      copyPrompt: "Invite opted-in leads to book a quick demo",
      aiBusinessName: "SignalStack Demo Co",
      aiTone: "concise"
    });

    expect(() => {
      (productCampaignComposerDefaults as { name: string }).name = "Unsafe";
    }).toThrow(TypeError);
    expect(() => {
      (productCampaignComposerDefaults as { copyPrompt: string }).copyPrompt = "Unsafe";
    }).toThrow(TypeError);
    expect(() => {
      (productCampaignComposerDefaults as { aiTone: string }).aiTone = "unsafe";
    }).toThrow(TypeError);
    expect(productCampaignComposerDefaults.name).toBe("Product demo campaign");
  });
});
