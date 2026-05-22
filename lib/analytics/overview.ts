import { prisma } from "@/lib/db/prisma";
import { aggregateUsageEvents } from "@/lib/billing/metering";

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
      total: messages
    },
    usage: aggregateUsageEvents(usageEvents)
  };
}
