import { UsageEventType } from "@prisma/client";
import { aggregateUsageEvents } from "@/lib/billing/metering";
import { prisma } from "@/lib/db/prisma";

export const productNavigation = Object.freeze([
  { href: "/dashboard/contacts", label: "Contacts", note: "audience and consent" },
  { href: "/dashboard/campaigns", label: "Campaigns", note: "drafts and scheduling" },
  { href: "/dashboard/inbox", label: "Inbox", note: "open conversations" },
  { href: "/dashboard/templates", label: "Templates", note: "message copy" },
  { href: "/dashboard/analytics", label: "Analytics", note: "local performance" },
  { href: "/dashboard/compliance", label: "Compliance", note: "go-live readiness" },
  { href: "/settings", label: "Settings", note: "operator controls" }
] as const);

export async function getProductDashboard(orgId: string) {
  const [
    contacts,
    optedInContacts,
    optedOutContacts,
    campaigns,
    draftCampaigns,
    scheduledCampaigns,
    openConversations,
    templates,
    messages,
    complianceProfile,
    usageEvents
  ] = await Promise.all([
    prisma.contact.count({ where: { orgId, archivedAt: null } }),
    prisma.contact.count({ where: { orgId, archivedAt: null, consentStatus: "OPTED_IN" } }),
    prisma.contact.count({ where: { orgId, archivedAt: null, consentStatus: "OPTED_OUT" } }),
    prisma.campaign.count({ where: { orgId } }),
    prisma.campaign.count({ where: { orgId, status: "DRAFT" } }),
    prisma.campaign.count({ where: { orgId, status: "SCHEDULED" } }),
    prisma.conversation.count({ where: { orgId, status: "OPEN" } }),
    prisma.messageTemplate.count({ where: { orgId } }),
    prisma.message.count({ where: { orgId } }),
    prisma.complianceProfile.findUnique({ where: { orgId } }),
    prisma.usageEvent.findMany({ where: { orgId }, select: { type: true, quantity: true } })
  ]);

  const requiredComplianceFields = [
    complianceProfile?.businessName,
    complianceProfile?.messagingUseCase,
    complianceProfile?.optInDescription,
    complianceProfile?.privacyPolicyUrl,
    complianceProfile?.termsOfServiceUrl
  ];
  const completeComplianceFields = requiredComplianceFields.filter(Boolean).length;
  const usage = aggregateUsageEvents(usageEvents);

  return {
    contacts: {
      total: contacts,
      optedIn: optedInContacts,
      optedOut: optedOutContacts
    },
    campaigns: {
      total: campaigns,
      draft: draftCampaigns,
      scheduled: scheduledCampaigns
    },
    inbox: {
      open: openConversations,
      messages
    },
    templates: {
      total: templates
    },
    compliance: {
      completeFields: completeComplianceFields,
      requiredFields: requiredComplianceFields.length,
      a2pRegistrationStatus: complianceProfile?.a2pRegistrationStatus ?? "NOT_STARTED"
    },
    usage: {
      fakeAiRequests: usage[UsageEventType.AI_REQUEST],
      totalEvents: Object.values(usage).reduce((total, quantity) => total + quantity, 0)
    }
  };
}
