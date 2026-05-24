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

const productDashboardSignalRowItems = [
  { key: "consentCoverage", label: "Consent coverage" },
  { key: "optInRate", label: "Opt-in rate" },
  { key: "scheduledWork", label: "Scheduled work" },
  { key: "inboxLoad", label: "Inbox load" },
  { key: "fakeAiRequests", label: "Fake AI requests" },
  { key: "localUsageEvents", label: "Local usage events" }
] as const;

type ProductDashboardSignalKey = (typeof productDashboardSignalRowItems)[number]["key"];

export const productDashboardSignalRows = Object.freeze(
  productDashboardSignalRowItems.map((row) => Object.freeze({ ...row }))
);

const productDashboardSectionItems = [
  {
    id: "contacts",
    title: "Contacts",
    eyebrow: "Audience",
    rows: [
      { key: "activeContacts", label: "Active contacts" },
      { key: "optedIn", label: "Opted in" },
      { key: "optedOut", label: "Opted out" }
    ]
  },
  {
    id: "compliance",
    title: "Compliance",
    eyebrow: "Readiness",
    rows: [
      { key: "profileFields", label: "Profile fields" },
      { key: "a2pStatus", label: "A2P status" },
      { key: "liveMessaging", label: "Live messaging" }
    ]
  },
  {
    id: "campaigns",
    title: "Campaigns",
    eyebrow: "Marketing",
    rows: [
      { key: "totalCampaigns", label: "Total campaigns" },
      { key: "drafts", label: "Drafts" },
      { key: "scheduled", label: "Scheduled" }
    ]
  },
  {
    id: "inbox",
    title: "Inbox",
    eyebrow: "Response",
    rows: [
      { key: "openThreads", label: "Open threads" },
      { key: "localMessages", label: "Local messages" },
      { key: "providerSends", label: "Provider sends" }
    ]
  },
  {
    id: "templates",
    title: "Templates",
    eyebrow: "Copy",
    rows: [
      { key: "savedTemplates", label: "Saved templates" },
      { key: "aiProvider", label: "AI provider" },
      { key: "liveAi", label: "Live AI" }
    ]
  }
] as const;

type ProductDashboardSectionStatusKey = (typeof productDashboardSectionItems)[number]["rows"][number]["key"];

export const productDashboardSections = Object.freeze(
  productDashboardSectionItems.map((section) =>
    Object.freeze({
      id: section.id,
      title: section.title,
      eyebrow: section.eyebrow,
      rows: Object.freeze(section.rows.map((row) => Object.freeze({ ...row })))
    })
  )
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
  const signalValues: Record<ProductDashboardSignalKey, string> = {
    consentCoverage: `${dashboard.contacts.optedIn}/${dashboard.contacts.total}`,
    optInRate: `${dashboard.contacts.optedInPercent}%`,
    scheduledWork: String(dashboard.campaigns.scheduled),
    inboxLoad: String(dashboard.inbox.open),
    fakeAiRequests: String(dashboard.usage.fakeAiRequests),
    localUsageEvents: String(dashboard.usage.totalEvents)
  };
  const sectionStatusValues: Record<ProductDashboardSectionStatusKey, string> = {
    activeContacts: String(dashboard.contacts.total),
    optedIn: String(dashboard.contacts.optedIn),
    optedOut: String(dashboard.contacts.optedOut),
    profileFields: `${dashboard.compliance.completeFields}/${dashboard.compliance.requiredFields}`,
    a2pStatus: dashboard.compliance.a2pRegistrationStatus,
    liveMessaging: "blocked by default",
    totalCampaigns: String(dashboard.campaigns.total),
    drafts: String(dashboard.campaigns.draft),
    scheduled: String(dashboard.campaigns.scheduled),
    openThreads: String(dashboard.inbox.open),
    localMessages: String(dashboard.inbox.messages),
    providerSends: "disabled",
    savedTemplates: String(dashboard.templates.total),
    aiProvider: "fake by default",
    liveAi: "blocked"
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
    }),
    signals: productDashboardSignalRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: signalValues[row.key]
    })),
    sections: productDashboardSections.map((section) => ({
      id: section.id,
      title: section.title,
      eyebrow: section.eyebrow,
      rows: section.rows.map((row) => ({
        key: row.key,
        label: row.label,
        value: sectionStatusValues[row.key]
      }))
    }))
  };
}
