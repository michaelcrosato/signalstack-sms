import { UsageEventType } from "@prisma/client";
import { getAnalyticsOverview } from "@/lib/analytics/overview";

const productAnalyticsUsageRowItems = [
  { type: UsageEventType.CONTACT_IMPORTED, label: "Contacts imported" },
  { type: UsageEventType.MESSAGE_INBOUND, label: "Inbound messages" },
  { type: UsageEventType.CAMPAIGN_SCHEDULED, label: "Campaigns scheduled" },
  { type: UsageEventType.AI_REQUEST, label: "Fake AI requests" }
] as const;

export const productAnalyticsUsageRows = Object.freeze(
  productAnalyticsUsageRowItems.map((row) => Object.freeze({ ...row }))
);

export async function getProductAnalytics(orgId: string) {
  const overview = await getAnalyticsOverview(orgId);
  const consentCoveragePercent =
    overview.contacts.total > 0 ? Math.round((overview.contacts.optedIn / overview.contacts.total) * 100) : 0;
  const resolvedConversationPercent =
    overview.conversations.total > 0
      ? Math.round((overview.conversations.resolved / overview.conversations.total) * 100)
      : 0;
  const scheduledCampaignPercent =
    overview.campaigns.total > 0 ? Math.round((overview.campaigns.scheduled / overview.campaigns.total) * 100) : 0;
  const totalUsageEvents = Object.values(overview.usage).reduce((total, quantity) => total + quantity, 0);
  const fakeAiUsagePercent =
    totalUsageEvents > 0 ? Math.round((overview.usage[UsageEventType.AI_REQUEST] / totalUsageEvents) * 100) : 0;

  return {
    ...overview,
    derived: {
      consentCoveragePercent,
      optedOutPercent:
        overview.contacts.total > 0 ? Math.round((overview.contacts.optedOut / overview.contacts.total) * 100) : 0,
      scheduledCampaignPercent,
      resolvedConversationPercent,
      averageMessagesPerConversation:
        overview.conversations.total > 0 ? Number((overview.messages.total / overview.conversations.total).toFixed(1)) : 0,
      totalUsageEvents,
      fakeAiUsagePercent
    },
    usageRows: productAnalyticsUsageRows.map((row) => ({
      type: row.type,
      label: row.label,
      quantity: overview.usage[row.type]
    }))
  };
}
