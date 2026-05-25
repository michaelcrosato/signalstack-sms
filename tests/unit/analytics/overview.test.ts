import { UsageEventType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { aggregateUsageEvents } from "@/lib/billing/metering";
import {
  outboundDeliveredMessageWhere,
  outboundFailedMessageWhere,
  outboundMessageWhere,
  outboundPendingMessageWhere
} from "@/lib/messaging/delivery-counts";

type CountArgs = { where: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  contactCount: vi.fn(),
  campaignCount: vi.fn(),
  conversationCount: vi.fn(),
  messageCount: vi.fn(),
  usageEventFindMany: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    contact: { count: mocks.contactCount },
    campaign: { count: mocks.campaignCount },
    conversation: { count: mocks.conversationCount },
    message: { count: mocks.messageCount },
    usageEvent: { findMany: mocks.usageEventFindMany }
  }
}));

describe("analytics usage aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contactCount.mockImplementation(async ({ where }: CountArgs) => {
      if (where.consentStatus === "OPTED_IN") {
        return 6;
      }
      if (where.consentStatus === "OPTED_OUT") {
        return 2;
      }

      return 10;
    });
    mocks.campaignCount.mockImplementation(async ({ where }: CountArgs) => (where.status === "SCHEDULED" ? 3 : 7));
    mocks.conversationCount.mockImplementation(async ({ where }: CountArgs) => (where.status === "OPEN" ? 4 : 9));
    mocks.messageCount.mockImplementation(async ({ where }: CountArgs) => {
      if (where.deliveredAt && where.failedAt === null) {
        return 3;
      }
      if (where.deliveredAt === null && where.failedAt === null) {
        return 2;
      }
      if (where.OR) {
        return 1;
      }
      if (where.direction === "INBOUND") {
        return 11;
      }
      if (where.direction === "OUTBOUND") {
        return 5;
      }

      return 16;
    });
    mocks.usageEventFindMany.mockResolvedValue([
      { type: UsageEventType.CONTACT_IMPORTED, quantity: 10 },
      { type: UsageEventType.CAMPAIGN_SCHEDULED, quantity: 1 }
    ]);
  });

  it("supports overview usage totals", () => {
    expect(
      aggregateUsageEvents([
        { type: UsageEventType.CONTACT_IMPORTED, quantity: 10 },
        { type: UsageEventType.CAMPAIGN_SCHEDULED, quantity: 1 }
      ])
    ).toMatchObject({
      [UsageEventType.CONTACT_IMPORTED]: 10,
      [UsageEventType.CAMPAIGN_SCHEDULED]: 1
    });
  });

  it("returns tenant-scoped delivery counts from local message rows", async () => {
    await expect(getAnalyticsOverview("org_analytics")).resolves.toMatchObject({
      contacts: {
        total: 10,
        optedIn: 6,
        optedOut: 2
      },
      campaigns: {
        total: 7,
        scheduled: 3
      },
      conversations: {
        total: 9,
        open: 4,
        resolved: 5
      },
      messages: {
        total: 16,
        inbound: 11,
        outbound: 5,
        delivered: 3,
        pending: 2,
        failed: 1
      },
      usage: {
        [UsageEventType.CONTACT_IMPORTED]: 10,
        [UsageEventType.CAMPAIGN_SCHEDULED]: 1
      }
    });

    expect(mocks.messageCount).toHaveBeenCalledWith({ where: { orgId: "org_analytics" } });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: { orgId: "org_analytics", direction: "INBOUND" } });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: outboundMessageWhere("org_analytics") });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: outboundDeliveredMessageWhere("org_analytics") });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: outboundPendingMessageWhere("org_analytics") });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: outboundFailedMessageWhere("org_analytics") });
  });
});
