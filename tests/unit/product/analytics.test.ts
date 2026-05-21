import { UsageEventType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { getProductAnalytics } from "@/lib/product/analytics";

vi.mock("@/lib/analytics/overview", () => ({
  getAnalyticsOverview: vi.fn()
}));

describe("product analytics", () => {
  it("projects existing analytics overview into product-facing metrics", async () => {
    vi.mocked(getAnalyticsOverview).mockResolvedValue({
      contacts: {
        total: 4,
        optedIn: 3,
        optedOut: 1
      },
      campaigns: {
        total: 2
      },
      conversations: {
        total: 5,
        open: 2,
        resolved: 3
      },
      messages: {
        total: 11
      },
      usage: {
        [UsageEventType.CONTACT_IMPORTED]: 4,
        [UsageEventType.MESSAGE_INBOUND]: 3,
        [UsageEventType.CAMPAIGN_SCHEDULED]: 2,
        [UsageEventType.AI_REQUEST]: 1
      }
    });

    const analytics = await getProductAnalytics("org_123");

    expect(getAnalyticsOverview).toHaveBeenCalledWith("org_123");
    expect(analytics.derived).toMatchObject({
      consentCoveragePercent: 75,
      optedOutPercent: 25,
      resolvedConversationPercent: 60,
      averageMessagesPerConversation: 2.2
    });
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
        total: 0
      },
      conversations: {
        total: 0,
        open: 0,
        resolved: 0
      },
      messages: {
        total: 0
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
        resolvedConversationPercent: 0,
        averageMessagesPerConversation: 0
      }
    });
  });
});
