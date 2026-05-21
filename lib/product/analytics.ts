import { UsageEventType } from "@prisma/client";
import { getAnalyticsOverview } from "@/lib/analytics/overview";

const usageLabels: Record<UsageEventType, string> = {
  [UsageEventType.CONTACT_IMPORTED]: "Contacts imported",
  [UsageEventType.MESSAGE_INBOUND]: "Inbound messages",
  [UsageEventType.CAMPAIGN_SCHEDULED]: "Campaigns scheduled",
  [UsageEventType.AI_REQUEST]: "Fake AI requests"
};

export async function getProductAnalytics(orgId: string) {
  const overview = await getAnalyticsOverview(orgId);
  const consentCoveragePercent =
    overview.contacts.total > 0 ? Math.round((overview.contacts.optedIn / overview.contacts.total) * 100) : 0;
  const resolvedConversationPercent =
    overview.conversations.total > 0
      ? Math.round((overview.conversations.resolved / overview.conversations.total) * 100)
      : 0;

  return {
    ...overview,
    derived: {
      consentCoveragePercent,
      optedOutPercent:
        overview.contacts.total > 0 ? Math.round((overview.contacts.optedOut / overview.contacts.total) * 100) : 0,
      resolvedConversationPercent,
      averageMessagesPerConversation:
        overview.conversations.total > 0 ? Number((overview.messages.total / overview.conversations.total).toFixed(1)) : 0
    },
    usageRows: Object.values(UsageEventType).map((type) => ({
      type,
      label: usageLabels[type],
      quantity: overview.usage[type]
    }))
  };
}
