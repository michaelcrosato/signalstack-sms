import { prisma } from "@/lib/db/prisma";
import { aggregateUsageEvents } from "@/lib/billing/metering";
import {
  outboundDeliveredMessageWhere,
  outboundFailedMessageWhere,
  outboundMessageWhere,
  outboundPendingMessageWhere
} from "@/lib/messaging/delivery-counts";

export async function getAnalyticsOverview(orgId: string) {
  const [
    contacts,
    optedInContacts,
    optedOutContacts,
    campaigns,
    scheduledCampaigns,
    conversations,
    openConversations,
    messages,
    inboundMessages,
    outboundMessages,
    deliveredMessages,
    pendingMessages,
    failedMessages,
    lastOutboundMessage,
    usageEvents
  ] = await Promise.all([
    prisma.contact.count({ where: { orgId, archivedAt: null } }),
    prisma.contact.count({ where: { orgId, archivedAt: null, consentStatus: "OPTED_IN" } }),
    prisma.contact.count({ where: { orgId, archivedAt: null, consentStatus: "OPTED_OUT" } }),
    prisma.campaign.count({ where: { orgId } }),
    prisma.campaign.count({ where: { orgId, status: "SCHEDULED" } }),
    prisma.conversation.count({ where: { orgId } }),
    prisma.conversation.count({ where: { orgId, status: "OPEN" } }),
    prisma.message.count({ where: { orgId } }),
    prisma.message.count({ where: { orgId, direction: "INBOUND" } }),
    prisma.message.count({ where: outboundMessageWhere(orgId) }),
    prisma.message.count({ where: outboundDeliveredMessageWhere(orgId) }),
    prisma.message.count({ where: outboundPendingMessageWhere(orgId) }),
    prisma.message.count({ where: outboundFailedMessageWhere(orgId) }),
    prisma.message.findFirst({
      where: outboundMessageWhere(orgId),
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    }),
    prisma.usageEvent.findMany({ where: { orgId }, select: { type: true, quantity: true } })
  ]);

  return {
    contacts: {
      total: contacts,
      optedIn: optedInContacts,
      optedOut: optedOutContacts
    },
    campaigns: {
      total: campaigns,
      scheduled: scheduledCampaigns
    },
    conversations: {
      total: conversations,
      open: openConversations,
      resolved: conversations - openConversations
    },
    messages: {
      total: messages,
      inbound: inboundMessages,
      outbound: outboundMessages,
      delivered: deliveredMessages,
      pending: pendingMessages,
      failed: failedMessages,
      lastOutboundAt: lastOutboundMessage?.createdAt.toISOString() ?? null
    },
    usage: aggregateUsageEvents(usageEvents)
  };
}
