import { prisma } from "@/lib/db/prisma";

export const productNavigation = Object.freeze([
  { href: "#contacts", label: "Contacts", note: "audience and consent" },
  { href: "#campaigns", label: "Campaigns", note: "drafts and scheduling" },
  { href: "#inbox", label: "Inbox", note: "open conversations" },
  { href: "#templates", label: "Templates", note: "message copy" },
  { href: "#analytics", label: "Analytics", note: "local performance" },
  { href: "#compliance", label: "Compliance", note: "go-live readiness" },
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
    complianceProfile
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
    prisma.complianceProfile.findUnique({ where: { orgId } })
  ]);

  const requiredComplianceFields = [
    complianceProfile?.businessName,
    complianceProfile?.messagingUseCase,
    complianceProfile?.optInDescription,
    complianceProfile?.privacyPolicyUrl,
    complianceProfile?.termsOfServiceUrl
  ];
  const completeComplianceFields = requiredComplianceFields.filter(Boolean).length;

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
    }
  };
}
