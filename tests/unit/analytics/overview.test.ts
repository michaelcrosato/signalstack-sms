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
  contactGroupBy: vi.fn(),
  campaignGroupBy: vi.fn(),
  conversationGroupBy: vi.fn(),
  messageGroupBy: vi.fn(),
  messageCount: vi.fn(),
  messageFindFirst: vi.fn(),
  usageEventFindMany: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    contact: { groupBy: mocks.contactGroupBy },
    campaign: { groupBy: mocks.campaignGroupBy },
    conversation: { groupBy: mocks.conversationGroupBy },
    message: { groupBy: mocks.messageGroupBy, count: mocks.messageCount, findFirst: mocks.messageFindFirst },
    usageEvent: { findMany: mocks.usageEventFindMany }
  }
}));

describe("analytics usage aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.contactGroupBy.mockResolvedValue([
      { consentStatus: "OPTED_IN", _count: { _all: 6 } },
      { consentStatus: "OPTED_OUT", _count: { _all: 2 } },
      { consentStatus: "UNKNOWN", _count: { _all: 2 } }
    ]);

    mocks.campaignGroupBy.mockResolvedValue([
      { status: "SCHEDULED", _count: { _all: 3 } },
      { status: "DRAFT", _count: { _all: 4 } }
    ]);

    mocks.conversationGroupBy.mockResolvedValue([
      { status: "OPEN", _count: { _all: 4 } },
      { status: "RESOLVED", _count: { _all: 5 } }
    ]);

    mocks.messageGroupBy.mockResolvedValue([
      { direction: "INBOUND", _count: { _all: 11 } },
      { direction: "OUTBOUND", _count: { _all: 5 } }
    ]);

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

      return 0;
    });
    mocks.usageEventFindMany.mockResolvedValue([
      { type: UsageEventType.CONTACT_IMPORTED, quantity: 10 },
      { type: UsageEventType.CAMPAIGN_SCHEDULED, quantity: 1 }
    ]);
    mocks.messageFindFirst.mockResolvedValue({ createdAt: new Date("2026-01-04T12:00:00.000Z") });
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
        failed: 1,
        lastOutboundAt: "2026-01-04T12:00:00.000Z"
      },
      usage: {
        [UsageEventType.CONTACT_IMPORTED]: 10,
        [UsageEventType.CAMPAIGN_SCHEDULED]: 1
      }
    });

    expect(mocks.contactGroupBy).toHaveBeenCalledWith({ by: ["consentStatus"], where: { orgId: "org_analytics", archivedAt: null }, _count: { _all: true } });
    expect(mocks.campaignGroupBy).toHaveBeenCalledWith({ by: ["status"], where: { orgId: "org_analytics" }, _count: { _all: true } });
    expect(mocks.conversationGroupBy).toHaveBeenCalledWith({ by: ["status"], where: { orgId: "org_analytics" }, _count: { _all: true } });
    expect(mocks.messageGroupBy).toHaveBeenCalledWith({ by: ["direction"], where: { orgId: "org_analytics" }, _count: { _all: true } });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: outboundDeliveredMessageWhere("org_analytics") });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: outboundPendingMessageWhere("org_analytics") });
    expect(mocks.messageCount).toHaveBeenCalledWith({ where: outboundFailedMessageWhere("org_analytics") });
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: outboundMessageWhere("org_analytics"),
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
  });
});
