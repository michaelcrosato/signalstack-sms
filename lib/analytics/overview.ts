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
    contactGroups,
    campaignGroups,
    conversationGroups,
    messageDirectionGroups,
    deliveredMessages,
    pendingMessages,
    failedMessages,
    lastOutboundMessage,
    usageEvents
  ] = await Promise.all([
    prisma.contact.groupBy({ by: ["consentStatus"], where: { orgId, archivedAt: null }, _count: { _all: true } }),
    prisma.campaign.groupBy({ by: ["status"], where: { orgId }, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ["status"], where: { orgId }, _count: { _all: true } }),
    prisma.message.groupBy({ by: ["direction"], where: { orgId }, _count: { _all: true } }),
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

  const contacts = contactGroups.reduce((acc, g) => acc + g._count._all, 0);
  const optedInContacts = contactGroups.find(g => g.consentStatus === "OPTED_IN")?._count._all ?? 0;
  const optedOutContacts = contactGroups.find(g => g.consentStatus === "OPTED_OUT")?._count._all ?? 0;

  const campaigns = campaignGroups.reduce((acc, g) => acc + g._count._all, 0);
  const scheduledCampaigns = campaignGroups.find(g => g.status === "SCHEDULED")?._count._all ?? 0;

  const conversations = conversationGroups.reduce((acc, g) => acc + g._count._all, 0);
  const openConversations = conversationGroups.find(g => g.status === "OPEN")?._count._all ?? 0;

  const messages = messageDirectionGroups.reduce((acc, g) => acc + g._count._all, 0);
  const inboundMessages = messageDirectionGroups.find(g => g.direction === "INBOUND")?._count._all ?? 0;
  const outboundMessages = messageDirectionGroups.find(g => g.direction === "OUTBOUND")?._count._all ?? 0;

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
