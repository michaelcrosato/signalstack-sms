import { UsageEventType } from "@prisma/client";
import { aggregateUsageEvents } from "@/lib/billing/metering";
import { prisma } from "@/lib/db/prisma";
import { productComplianceFields } from "@/lib/product/compliance-fields";

const productNavigationItems = [
  { href: "/dashboard/contacts", label: "Contacts", note: "audience and consent" },
  { href: "/dashboard/campaigns", label: "Campaigns", note: "drafts and scheduling" },
  { href: "/dashboard/inbox", label: "Inbox", note: "open conversations" },
  { href: "/dashboard/templates", label: "Templates", note: "message copy" },
  { href: "/dashboard/analytics", label: "Analytics", note: "local performance" },
  { href: "/dashboard/compliance", label: "Compliance", note: "go-live readiness" },
  { href: "/settings", label: "Settings", note: "operator controls" }
] as const;

export const productNavigation = Object.freeze(productNavigationItems.map((item) => Object.freeze({ ...item })));

const productDashboardActionItems = [
  { href: "/demo", label: "Demo Console", style: "secondary" },
  { href: "/settings", label: "Go-Live Settings", style: "primary" }
] as const;

export const productDashboardActions = Object.freeze(
  productDashboardActionItems.map((action) => Object.freeze({ ...action }))
);

const productDashboardMetricRowItems = [
  { key: "activeContacts", label: "Active Contacts" },
  { key: "campaigns", label: "Campaigns" },
  { key: "openConversations", label: "Open Conversations" },
  { key: "templates", label: "Templates" }
] as const;

export const productDashboardMetricRows = Object.freeze(
  productDashboardMetricRowItems.map((row) => Object.freeze({ ...row }))
);

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

  const completeComplianceFields = productComplianceFields.filter((field) => Boolean(complianceProfile?.[field.key])).length;
  const usage = aggregateUsageEvents(usageEvents);
  const optedInPercent = contacts > 0 ? Math.round((optedInContacts / contacts) * 100) : 0;

  const dashboard = {
    contacts: {
      total: contacts,
      optedIn: optedInContacts,
      optedOut: optedOutContacts,
      optedInPercent
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
      requiredFields: productComplianceFields.length,
      a2pRegistrationStatus: complianceProfile?.a2pRegistrationStatus ?? "NOT_STARTED"
    },
    usage: {
      fakeAiRequests: usage[UsageEventType.AI_REQUEST],
      totalEvents: Object.values(usage).reduce((total, quantity) => total + quantity, 0)
    }
  };

  const metricValues = {
    activeContacts: { value: dashboard.contacts.total, detail: `${dashboard.contacts.optedIn} opted in` },
    campaigns: { value: dashboard.campaigns.total, detail: `${dashboard.campaigns.draft} drafts` },
    openConversations: { value: dashboard.inbox.open, detail: `${dashboard.inbox.messages} messages` },
    templates: { value: dashboard.templates.total, detail: "ready for campaign copy" }
  };

  return {
    ...dashboard,
    metrics: productDashboardMetricRows.map((row) => {
      const metric = metricValues[row.key];

      return {
        key: row.key,
        label: row.label,
        value: metric.value,
        detail: metric.detail
      };
    })
  };
}
