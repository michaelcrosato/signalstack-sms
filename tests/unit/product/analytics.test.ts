import { CampaignStatus, UsageEventType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { listCampaignsWithDelivery } from "@/lib/db/repositories/campaigns";
import {
  getProductAnalytics,
  productAnalyticsDeliveryRows,
  productAnalyticsMetricRows,
  productAnalyticsUsageRows
} from "@/lib/product/analytics";

vi.mock("@/lib/analytics/overview", () => ({
  getAnalyticsOverview: vi.fn()
}));

vi.mock("@/lib/db/repositories/campaigns", () => ({
  listCampaignsWithDelivery: vi.fn()
}));

describe("product analytics", () => {
  beforeEach(() => {
    vi.mocked(getAnalyticsOverview).mockReset();
    vi.mocked(listCampaignsWithDelivery).mockReset();
    vi.mocked(listCampaignsWithDelivery).mockResolvedValue([]);
  });

  it("projects existing analytics overview into product-facing metrics", async () => {
    vi.mocked(getAnalyticsOverview).mockResolvedValue({
      contacts: {
        total: 4,
        optedIn: 3,
        optedOut: 1
      },
      campaigns: {
        total: 4,
        scheduled: 1
      },
      conversations: {
        total: 5,
        open: 2,
        resolved: 3
      },
      messages: {
        total: 11,
        inbound: 6,
        outbound: 5,
        delivered: 4,
        pending: 0,
        failed: 1,
        lastOutboundAt: "2026-01-04T12:00:00.000Z"
      },
      usage: {
        [UsageEventType.CONTACT_IMPORTED]: 4,
        [UsageEventType.MESSAGE_INBOUND]: 3,
        [UsageEventType.CAMPAIGN_SCHEDULED]: 2,
        [UsageEventType.AI_REQUEST]: 1
      }
    });
    vi.mocked(listCampaignsWithDelivery).mockResolvedValue([
      {
        id: "campaign_pending",
        orgId: "org_123",
        name: "Pending Review",
        body: "Hi",
        status: CampaignStatus.SCHEDULED,
        templateId: null,
        scheduledAt: new Date("2026-01-05T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
        template: null,
        recipients: [],
        messages: [
          {
            direction: "OUTBOUND",
            providerStatus: "sent",
            deliveredAt: null,
            failedAt: null,
            createdAt: new Date("2026-01-04T10:00:00.000Z")
          },
          {
            direction: "OUTBOUND",
            providerStatus: "delivered",
            deliveredAt: new Date("2026-01-04T11:00:00.000Z"),
            failedAt: null,
            createdAt: new Date("2026-01-04T09:00:00.000Z")
          }
        ]
      },
      {
        id: "campaign_failed",
        orgId: "org_123",
        name: "Failed Review",
        body: "Hi",
        status: CampaignStatus.SCHEDULED,
        templateId: null,
        scheduledAt: new Date("2026-01-06T00:00:00.000Z"),
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        updatedAt: new Date("2026-01-06T00:00:00.000Z"),
        template: null,
        recipients: [],
        messages: [
          {
            direction: "OUTBOUND",
            providerStatus: "failed",
            deliveredAt: null,
            failedAt: new Date("2026-01-04T12:00:00.000Z"),
            createdAt: new Date("2026-01-04T12:00:00.000Z")
          },
          {
            direction: "INBOUND",
            providerStatus: "failed",
            deliveredAt: null,
            failedAt: new Date("2026-01-04T13:00:00.000Z"),
            createdAt: new Date("2026-01-04T13:00:00.000Z")
          }
        ]
      },
      {
        id: "campaign_empty",
        orgId: "org_123",
        name: "No Evidence",
        body: "Hi",
        status: CampaignStatus.DRAFT,
        templateId: null,
        scheduledAt: null,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        template: null,
        recipients: [],
        messages: []
      }
    ]);

    const analytics = await getProductAnalytics("org_123");

    expect(getAnalyticsOverview).toHaveBeenCalledWith("org_123");
    expect(listCampaignsWithDelivery).toHaveBeenCalledWith("org_123");
    expect(analytics.derived).toMatchObject({
      consentCoveragePercent: 75,
      optedOutPercent: 25,
      scheduledCampaignPercent: 25,
      resolvedConversationPercent: 60,
      averageMessagesPerConversation: 2.2,
      totalUsageEvents: 10,
      fakeAiUsagePercent: 10,
      deliveryRatePercent: 80,
      lastDeliveryEvidence: "2026-01-04T12:00:00.000Z",
      deliveryReviewStatus: "1 failed; review evidence"
    });
    expect(analytics.metrics).toEqual([
      { key: "consentCoverage", label: "Consent Coverage", value: "75%", detail: "3/4 opted in" },
      { key: "campaigns", label: "Campaigns", value: 4, detail: "local campaign records" },
      { key: "inboxLoad", label: "Inbox Load", value: 2, detail: "11 local messages" },
      { key: "usageEvents", label: "Usage Events", value: 10, detail: "local metering only" }
    ]);
    expect(analytics.deliveryRows).toEqual([
      { key: "outbound", label: "Outbound messages", value: "5" },
      { key: "delivered", label: "Delivered", value: "4" },
      { key: "pending", label: "Pending", value: "0" },
      { key: "failed", label: "Failed", value: "1" },
      { key: "deliveryRate", label: "Delivery rate", value: "80%" },
      { key: "reviewStatus", label: "Review status", value: "1 failed; review evidence" },
      { key: "lastDeliveryEvidence", label: "Last delivery evidence", value: "2026-01-04T12:00:00.000Z" }
    ]);
    expect(analytics.campaignDeliverySummary).toEqual({
      totalCampaigns: 3,
      visibleRows: 3,
      hiddenRows: 0,
      campaignsNeedingReview: 2,
      failedCampaigns: 1,
      pendingCampaigns: 1
    });
    expect(analytics.campaignDeliveryRows).toEqual([
      {
        id: "campaign_failed",
        name: "Failed Review",
        href: "/dashboard/campaigns/campaign_failed",
        status: CampaignStatus.SCHEDULED,
        outboundMessages: 1,
        delivered: 0,
        pending: 0,
        failed: 1,
        deliveryRatePercent: 0,
        reviewStatus: "1 failed; review evidence",
        lastOutboundMessage: "2026-01-04T12:00:00.000Z"
      },
      {
        id: "campaign_pending",
        name: "Pending Review",
        href: "/dashboard/campaigns/campaign_pending",
        status: CampaignStatus.SCHEDULED,
        outboundMessages: 2,
        delivered: 1,
        pending: 1,
        failed: 0,
        deliveryRatePercent: 50,
        reviewStatus: "1 pending; awaiting provider status",
        lastOutboundMessage: "2026-01-04T10:00:00.000Z"
      },
      {
        id: "campaign_empty",
        name: "No Evidence",
        href: "/dashboard/campaigns/campaign_empty",
        status: CampaignStatus.DRAFT,
        outboundMessages: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        deliveryRatePercent: 0,
        reviewStatus: "No outbound evidence",
        lastOutboundMessage: "none"
      }
    ]);
    expect(analytics.usageRows).toEqual([
      { type: UsageEventType.CONTACT_IMPORTED, label: "Contacts imported", quantity: 4 },
      { type: UsageEventType.MESSAGE_INBOUND, label: "Inbound messages", quantity: 3 },
      { type: UsageEventType.CAMPAIGN_SCHEDULED, label: "Campaigns scheduled", quantity: 2 },
      { type: UsageEventType.AI_REQUEST, label: "Fake AI requests", quantity: 1 }
    ]);
  });

  it("keeps zero-state derived metrics stable", async () => {
    vi.mocked(getAnalyticsOverview).mockResolvedValue({
      contacts: {
        total: 0,
        optedIn: 0,
        optedOut: 0
      },
      campaigns: {
        total: 0,
        scheduled: 0
      },
      conversations: {
        total: 0,
        open: 0,
        resolved: 0
      },
      messages: {
        total: 0,
        inbound: 0,
        outbound: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        lastOutboundAt: null
      },
      usage: {
        [UsageEventType.CONTACT_IMPORTED]: 0,
        [UsageEventType.MESSAGE_INBOUND]: 0,
        [UsageEventType.CAMPAIGN_SCHEDULED]: 0,
        [UsageEventType.AI_REQUEST]: 0
      }
    });

    await expect(getProductAnalytics("org_empty")).resolves.toMatchObject({
      derived: {
        consentCoveragePercent: 0,
        optedOutPercent: 0,
        scheduledCampaignPercent: 0,
        resolvedConversationPercent: 0,
        averageMessagesPerConversation: 0,
        totalUsageEvents: 0,
        fakeAiUsagePercent: 0,
        deliveryRatePercent: 0,
        lastDeliveryEvidence: "none",
        deliveryReviewStatus: "No outbound evidence"
      }
    });
  });

  it("summarizes visible and hidden campaign delivery review rows", async () => {
    vi.mocked(getAnalyticsOverview).mockResolvedValue({
      contacts: {
        total: 0,
        optedIn: 0,
        optedOut: 0
      },
      campaigns: {
        total: 6,
        scheduled: 0
      },
      conversations: {
        total: 0,
        open: 0,
        resolved: 0
      },
      messages: {
        total: 0,
        inbound: 0,
        outbound: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        lastOutboundAt: null
      },
      usage: {
        [UsageEventType.CONTACT_IMPORTED]: 0,
        [UsageEventType.MESSAGE_INBOUND]: 0,
        [UsageEventType.CAMPAIGN_SCHEDULED]: 0,
        [UsageEventType.AI_REQUEST]: 0
      }
    });
    vi.mocked(listCampaignsWithDelivery).mockResolvedValue(
      Array.from({ length: 6 }, (_value, index) => ({
        id: `campaign_${index + 1}`,
        orgId: "org_123",
        name: `Campaign ${String(index + 1).padStart(2, "0")}`,
        body: "Hi",
        status: CampaignStatus.DRAFT,
        templateId: null,
        scheduledAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        template: null,
        recipients: [],
        messages: []
      }))
    );

    const analytics = await getProductAnalytics("org_123");

    expect(analytics.campaignDeliverySummary).toEqual({
      totalCampaigns: 6,
      visibleRows: 5,
      hiddenRows: 1,
      campaignsNeedingReview: 0,
      failedCampaigns: 0,
      pendingCampaigns: 0
    });
    expect(analytics.campaignDeliveryRows).toHaveLength(5);
    expect(analytics.campaignDeliveryRows.map((row) => row.name)).toEqual([
      "Campaign 01",
      "Campaign 02",
      "Campaign 03",
      "Campaign 04",
      "Campaign 05"
    ]);
  });

  it("freezes product analytics metric metadata before rendering", () => {
    expect(Object.isFrozen(productAnalyticsMetricRows)).toBe(true);
    expect(productAnalyticsMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productAnalyticsMetricRows.map((row) => row.key)).toEqual([
      "consentCoverage",
      "campaigns",
      "inboxLoad",
      "usageEvents"
    ]);

    expect(() => {
      (productAnalyticsMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      });
    }).toThrow(TypeError);
    expect(() => {
      (productAnalyticsMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productAnalyticsMetricRows[0].label).toBe("Consent Coverage");
  });

  it("freezes product analytics usage row metadata before rendering", () => {
    expect(Object.isFrozen(productAnalyticsUsageRows)).toBe(true);
    expect(productAnalyticsUsageRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productAnalyticsUsageRows.map((row) => row.type)).toEqual([
      UsageEventType.CONTACT_IMPORTED,
      UsageEventType.MESSAGE_INBOUND,
      UsageEventType.CAMPAIGN_SCHEDULED,
      UsageEventType.AI_REQUEST
    ]);

    expect(() => {
      (productAnalyticsUsageRows as unknown as Array<{ type: UsageEventType; label: string }>).push({
        type: UsageEventType.AI_REQUEST,
        label: "Unsafe"
      });
    }).toThrow(TypeError);
    expect(() => {
      (productAnalyticsUsageRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productAnalyticsUsageRows[0].label).toBe("Contacts imported");
  });

  it("freezes product analytics delivery row metadata before rendering", () => {
    expect(Object.isFrozen(productAnalyticsDeliveryRows)).toBe(true);
    expect(productAnalyticsDeliveryRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productAnalyticsDeliveryRows.map((row) => row.key)).toEqual([
      "outbound",
      "delivered",
      "pending",
      "failed",
      "deliveryRate",
      "reviewStatus",
      "lastDeliveryEvidence"
    ]);

    expect(() => {
      (productAnalyticsDeliveryRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      });
    }).toThrow(TypeError);
    expect(() => {
      (productAnalyticsDeliveryRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productAnalyticsDeliveryRows[0].label).toBe("Outbound messages");
  });
});
