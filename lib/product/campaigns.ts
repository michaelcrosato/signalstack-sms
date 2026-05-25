import { CampaignStatus, ConsentStatus } from "@prisma/client";
import { getCampaignWithMessages, listCampaigns } from "@/lib/db/repositories/campaigns";
import { listContacts } from "@/lib/db/repositories/contacts";
import { listTemplates } from "@/lib/db/repositories/templates";
import { isTerminalDeliveryFailure } from "@/lib/messaging/delivery-status";

const productCampaignMetricRowItems = [
  { key: "total", label: "Total Campaigns" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "readyRecipients", label: "Ready Recipients" }
] as const;

export const productCampaignMetricRows = Object.freeze(
  productCampaignMetricRowItems.map((row) => Object.freeze({ ...row }))
);

const productCampaignDetailMetricRowItems = [
  { key: "status", label: "Status" },
  { key: "recipients", label: "Recipients" },
  { key: "template", label: "Template" },
  { key: "schedule", label: "Schedule" }
] as const;

type ProductCampaignDetailMetricKey = (typeof productCampaignDetailMetricRowItems)[number]["key"];

export const productCampaignDetailMetricRows = Object.freeze(
  productCampaignDetailMetricRowItems.map((row) => Object.freeze({ ...row }))
);

const productCampaignRecipientStatusRowItems = [
  { key: "consent", label: "Consent" },
  { key: "archived", label: "Archive" },
  { key: "sendState", label: "Send State" },
  { key: "blockReason", label: "Block Reason" }
] as const;

type ProductCampaignRecipientStatusKey = (typeof productCampaignRecipientStatusRowItems)[number]["key"];

export const productCampaignRecipientStatusRows = Object.freeze(
  productCampaignRecipientStatusRowItems.map((row) => Object.freeze({ ...row }))
);

const productCampaignDeliveryMetricRowItems = [
  { key: "outboundMessages", label: "Outbound Messages" },
  { key: "delivered", label: "Delivered" },
  { key: "failed", label: "Failed" },
  { key: "providerStatuses", label: "Provider Statuses" }
] as const;

type ProductCampaignDeliveryMetricKey = (typeof productCampaignDeliveryMetricRowItems)[number]["key"];

export const productCampaignDeliveryMetricRows = Object.freeze(
  productCampaignDeliveryMetricRowItems.map((row) => Object.freeze({ ...row }))
);

export async function getProductCampaigns(orgId: string) {
  const [campaigns, contacts, templates] = await Promise.all([
    listCampaigns(orgId),
    listContacts(orgId),
    listTemplates(orgId)
  ]);
  const summary = {
    total: campaigns.length,
    draft: campaigns.filter((campaign) => campaign.status === CampaignStatus.DRAFT).length,
    scheduled: campaigns.filter((campaign) => campaign.status === CampaignStatus.SCHEDULED).length,
    readyRecipients: contacts.filter((contact) => contact.consentStatus === ConsentStatus.OPTED_IN && !contact.archivedAt)
      .length
  };

  return {
    summary,
    metrics: productCampaignMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: summary[row.key]
    })),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      scheduledAt: campaign.scheduledAt,
      recipientCount: campaign.recipients.length,
      templateName: campaign.template?.name ?? "Custom copy",
      updatedAt: campaign.updatedAt
    })),
    contacts: contacts.map((contact) => ({
      id: contact.id,
      displayName: contact.displayName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone),
      phone: contact.phone,
      consentStatus: contact.consentStatus,
      disabled: contact.consentStatus !== ConsentStatus.OPTED_IN || Boolean(contact.archivedAt)
    })),
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      body: template.body
    }))
  };
}

export async function getProductCampaignDetail(orgId: string, campaignId: string) {
  const [campaign, contacts, templates] = await Promise.all([
    getCampaignWithMessages(orgId, campaignId),
    listContacts(orgId),
    listTemplates(orgId)
  ]);

  if (!campaign) {
    return null;
  }

  const selectedContactIds = new Set(campaign.recipients.map((recipient) => recipient.contactId));
  const deliveryMessages = campaign.messages.filter((message) => message.direction === "OUTBOUND");
  const deliverySummary = getCampaignDeliverySummary(deliveryMessages);
  const detail = {
    id: campaign.id,
    name: campaign.name,
    body: campaign.body,
    status: campaign.status,
    templateId: campaign.templateId ?? "",
    templateName: campaign.template?.name ?? "Custom copy",
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    canEdit: campaign.status === CampaignStatus.DRAFT,
    canCancel: campaign.status === CampaignStatus.SCHEDULED,
    selectedContactIds: [...selectedContactIds],
    recipientRows: campaign.recipients.map((recipient) => {
      const contact = recipient.contact;
      const recipientDetail = {
        id: contact.id,
        displayName:
          contact.displayName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone),
        phone: contact.phone,
        consentStatus: contact.consentStatus,
        archived: Boolean(contact.archivedAt),
        sendState: recipient.status,
        blockReason: recipient.blockReason
      };

      return {
        ...recipientDetail,
        statusRows: productCampaignRecipientStatusRows.map((row) => ({
          key: row.key,
          label: row.label,
          value: getCampaignRecipientStatusValue(row.key, recipientDetail)
        }))
      };
    }),
    deliveryRows: deliveryMessages.map((message) => ({
      id: message.id,
      contactDisplayName: message.contact
        ? message.contact.displayName ??
          ([message.contact.firstName, message.contact.lastName].filter(Boolean).join(" ") || message.contact.phone)
        : "Unknown contact",
      direction: message.direction,
      providerStatus: message.providerStatus ?? "local_only",
      providerMessageId: message.providerMessageId ?? "no provider id",
      createdAt: message.createdAt.toISOString(),
      deliveredAt: message.deliveredAt?.toISOString() ?? null,
      failedAt: message.failedAt?.toISOString() ?? null
    })),
    deliveryMetrics: productCampaignDeliveryMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: deliverySummary[row.key]
    })),
    contacts: contacts.map((contact) => ({
      id: contact.id,
      displayName: contact.displayName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone),
      phone: contact.phone,
      consentStatus: contact.consentStatus,
      disabled: contact.consentStatus !== ConsentStatus.OPTED_IN || Boolean(contact.archivedAt),
      selected: selectedContactIds.has(contact.id)
    })),
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      body: template.body
    }))
  };
  const metricValues: Record<ProductCampaignDetailMetricKey, string> = {
    status: detail.status,
    recipients: detail.recipientRows.length.toString(),
    template: detail.templateName,
    schedule: detail.scheduledAt ? new Date(detail.scheduledAt).toLocaleString("en-US") : "Not scheduled"
  };

  return {
    ...detail,
    metrics: productCampaignDetailMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: metricValues[row.key]
    }))
  };
}

function getCampaignDeliverySummary(
  messages: Array<{
    direction: string;
    providerStatus: string | null;
    deliveredAt: Date | null;
    failedAt: Date | null;
  }>
): Record<ProductCampaignDeliveryMetricKey, string> {
  const outboundMessages = messages.filter((message) => message.direction === "OUTBOUND");
  const delivered = outboundMessages.filter((message) => message.deliveredAt !== null);
  const failed = outboundMessages.filter(isTerminalDeliveryFailure);
  const providerStatuses = Array.from(new Set(outboundMessages.map((message) => message.providerStatus ?? "local_only")));

  return {
    outboundMessages: outboundMessages.length.toString(),
    delivered: delivered.length.toString(),
    failed: failed.length.toString(),
    providerStatuses: providerStatuses.length > 0 ? providerStatuses.join(", ") : "none"
  };
}

function getCampaignRecipientStatusValue(
  key: ProductCampaignRecipientStatusKey,
  recipient: {
    consentStatus: ConsentStatus;
    archived: boolean;
    sendState: string;
    blockReason: string | null;
  }
) {
  switch (key) {
    case "consent":
      return recipient.consentStatus;
    case "archived":
      return recipient.archived ? "archived" : "active";
    case "sendState":
      return recipient.sendState;
    case "blockReason":
      return recipient.blockReason ?? "none";
  }
}
