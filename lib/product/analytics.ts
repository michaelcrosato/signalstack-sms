import { UsageEventType } from "@prisma/client";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { listCampaignsWithDelivery } from "@/lib/db/repositories/campaigns";
import { getLocalDeliveryReviewStatus } from "@/lib/messaging/delivery-review";
import { isLocalDeliveryDelivered, isTerminalDeliveryFailure } from "@/lib/messaging/delivery-status";

const productAnalyticsMetricRowItems = [
  { key: "consentCoverage", label: "Consent Coverage" },
  { key: "campaigns", label: "Campaigns" },
  { key: "inboxLoad", label: "Inbox Load" },
  { key: "usageEvents", label: "Usage Events" }
] as const;

type ProductAnalyticsMetricKey = (typeof productAnalyticsMetricRowItems)[number]["key"];

export const productAnalyticsMetricRows = Object.freeze(
  productAnalyticsMetricRowItems.map((row) => Object.freeze({ ...row }))
);

const productAnalyticsUsageRowItems = [
  { type: UsageEventType.CONTACT_IMPORTED, label: "Contacts imported" },
  { type: UsageEventType.MESSAGE_INBOUND, label: "Inbound messages" },
  { type: UsageEventType.CAMPAIGN_SCHEDULED, label: "Campaigns scheduled" },
  { type: UsageEventType.AI_REQUEST, label: "Fake AI requests" }
] as const;

export const productAnalyticsUsageRows = Object.freeze(
  productAnalyticsUsageRowItems.map((row) => Object.freeze({ ...row }))
);

const productAnalyticsDeliveryRowItems = [
  { key: "outbound", label: "Outbound messages" },
  { key: "delivered", label: "Delivered" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "deliveryRate", label: "Delivery rate" },
  { key: "reviewStatus", label: "Review status" },
  { key: "lastDeliveryEvidence", label: "Last delivery evidence" }
] as const;

type ProductAnalyticsDeliveryRowKey = (typeof productAnalyticsDeliveryRowItems)[number]["key"];

export const productAnalyticsDeliveryRows = Object.freeze(
  productAnalyticsDeliveryRowItems.map((row) => Object.freeze({ ...row }))
);

export async function getProductAnalytics(orgId: string) {
  const [overview, campaigns] = await Promise.all([getAnalyticsOverview(orgId), listCampaignsWithDelivery(orgId)]);
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
  const deliveryRatePercent =
    overview.messages.outbound > 0 ? Math.round((overview.messages.delivered / overview.messages.outbound) * 100) : 0;
  const derived = {
    consentCoveragePercent,
    optedOutPercent:
      overview.contacts.total > 0 ? Math.round((overview.contacts.optedOut / overview.contacts.total) * 100) : 0,
    scheduledCampaignPercent,
    resolvedConversationPercent,
    averageMessagesPerConversation:
      overview.conversations.total > 0 ? Number((overview.messages.total / overview.conversations.total).toFixed(1)) : 0,
    totalUsageEvents,
    fakeAiUsagePercent,
    deliveryRatePercent,
    lastDeliveryEvidence: overview.messages.lastOutboundAt ?? "none",
    deliveryReviewStatus: getLocalDeliveryReviewStatus({
      outboundMessages: overview.messages.outbound,
      delivered: overview.messages.delivered,
      pending: overview.messages.pending,
      failed: overview.messages.failed
    })
  };
  const deliveryValues: Record<ProductAnalyticsDeliveryRowKey, string> = {
    outbound: overview.messages.outbound.toString(),
    delivered: overview.messages.delivered.toString(),
    pending: overview.messages.pending.toString(),
    failed: overview.messages.failed.toString(),
    deliveryRate: `${derived.deliveryRatePercent}%`,
    reviewStatus: derived.deliveryReviewStatus,
    lastDeliveryEvidence: derived.lastDeliveryEvidence
  };
  const metricValues: Record<ProductAnalyticsMetricKey, { value: number | string; detail: string }> = {
    consentCoverage: {
      value: `${derived.consentCoveragePercent}%`,
      detail: `${overview.contacts.optedIn}/${overview.contacts.total} opted in`
    },
    campaigns: { value: overview.campaigns.total, detail: "local campaign records" },
    inboxLoad: { value: overview.conversations.open, detail: `${overview.messages.total} local messages` },
    usageEvents: { value: derived.totalUsageEvents, detail: "local metering only" }
  };
  const campaignDeliveryRows = campaigns
    .map((campaign) => {
      const outboundMessages = campaign.messages.filter((message) => message.direction === "OUTBOUND");
      const delivered = outboundMessages.filter(isLocalDeliveryDelivered).length;
      const failed = outboundMessages.filter(isTerminalDeliveryFailure).length;
      const pending = outboundMessages.filter(
        (message) => message.deliveredAt === null && !isTerminalDeliveryFailure(message)
      ).length;
      const lastOutboundMessageAt = outboundMessages.reduce<Date | null>((latest, message) => {
        if (!message.createdAt) {
          return latest;
        }

        return latest === null || message.createdAt.getTime() > latest.getTime() ? message.createdAt : latest;
      }, null);
      const outboundCount = outboundMessages.length;

      return {
        id: campaign.id,
        name: campaign.name,
        href: `/dashboard/campaigns/${campaign.id}`,
        status: campaign.status,
        outboundMessages: outboundCount,
        delivered,
        pending,
        failed,
        deliveryRatePercent: outboundCount > 0 ? Math.round((delivered / outboundCount) * 100) : 0,
        reviewStatus: getLocalDeliveryReviewStatus({
          outboundMessages: outboundCount,
          delivered,
          pending,
          failed
        }),
        lastOutboundMessageAt,
        lastOutboundMessage: lastOutboundMessageAt?.toISOString() ?? "none"
      };
    })
    .sort((left, right) => {
      const priorityDelta = getCampaignDeliveryReviewPriority(left) - getCampaignDeliveryReviewPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const timeDelta =
        (right.lastOutboundMessageAt?.getTime() ?? 0) - (left.lastOutboundMessageAt?.getTime() ?? 0);
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      name: row.name,
      href: row.href,
      status: row.status,
      outboundMessages: row.outboundMessages,
      delivered: row.delivered,
      pending: row.pending,
      failed: row.failed,
      deliveryRatePercent: row.deliveryRatePercent,
      reviewStatus: row.reviewStatus,
      lastOutboundMessage: row.lastOutboundMessage
    }));

  return {
    ...overview,
    derived,
    metrics: productAnalyticsMetricRows.map((row) => {
      const metric = metricValues[row.key];

      return {
        key: row.key,
        label: row.label,
        value: metric.value,
        detail: metric.detail
      };
    }),
    deliveryRows: productAnalyticsDeliveryRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: deliveryValues[row.key]
    })),
    campaignDeliveryRows,
    usageRows: productAnalyticsUsageRows.map((row) => ({
      type: row.type,
      label: row.label,
      quantity: overview.usage[row.type]
    }))
  };
}

function getCampaignDeliveryReviewPriority(row: {
  outboundMessages: number;
  pending: number;
  failed: number;
}) {
  if (row.failed > 0) {
    return 0;
  }

  if (row.pending > 0) {
    return 1;
  }

  if (row.outboundMessages > 0) {
    return 2;
  }

  return 3;
}
