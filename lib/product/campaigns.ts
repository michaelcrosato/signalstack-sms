import { CampaignStatus, ConsentStatus } from "@prisma/client";
import { getCampaignWithMessages, listCampaignsWithDelivery } from "@/lib/db/repositories/campaigns";
import { listContacts } from "@/lib/db/repositories/contacts";
import { listTemplates } from "@/lib/db/repositories/templates";
import { isLocalDeliveryDelivered, isTerminalDeliveryFailure } from "@/lib/messaging/delivery-status";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";

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

const productCampaignRecipientReadinessMetricRowItems = [
  { key: "totalRecipients", label: "Total Recipients" },
  { key: "readyRecipients", label: "Ready Recipients" },
  { key: "blockedRecipients", label: "Blocked Recipients" },
  { key: "blockers", label: "Blockers" }
] as const;

type ProductCampaignRecipientReadinessMetricKey =
  (typeof productCampaignRecipientReadinessMetricRowItems)[number]["key"];

export const productCampaignRecipientReadinessMetricRows = Object.freeze(
  productCampaignRecipientReadinessMetricRowItems.map((row) => Object.freeze({ ...row }))
);

const productCampaignDeliveryMetricRowItems = [
  { key: "outboundMessages", label: "Outbound Messages" },
  { key: "recentEvidenceRows", label: "Recent Evidence Rows" },
  { key: "deliveryRate", label: "Delivery Rate" },
  { key: "delivered", label: "Delivered" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "lastOutboundMessage", label: "Last Outbound Message" },
  { key: "providerStatuses", label: "Provider Statuses" }
] as const;

type ProductCampaignDeliveryMetricKey = (typeof productCampaignDeliveryMetricRowItems)[number]["key"];

export const productCampaignDeliveryMetricRows = Object.freeze(
  productCampaignDeliveryMetricRowItems.map((row) => Object.freeze({ ...row }))
);

export async function getProductCampaigns(orgId: string) {
  const [campaigns, contacts, templates] = await Promise.all([
    listCampaignsWithDelivery(orgId),
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
    campaigns: campaigns.map((campaign) => {
      const deliverySummary = getCampaignDeliverySummary(campaign.messages);
      const readinessSummary = getCampaignRecipientReadinessSummary(campaign.recipients);
      const outboundMessages = Number(deliverySummary.outboundMessages);
      const delivered = Number(deliverySummary.delivered);
      const pending = Number(deliverySummary.pending);
      const failed = Number(deliverySummary.failed);

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt,
        recipientCount: campaign.recipients.length,
        readiness: readinessSummary,
        templateName: campaign.template?.name ?? "Custom copy",
        updatedAt: campaign.updatedAt,
        delivery: {
          outboundMessages,
          delivered,
          pending,
          failed,
          deliveryRatePercent: outboundMessages > 0 ? Math.round((delivered / outboundMessages) * 100) : 0
        }
      };
    }),
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

function getCampaignRecipientReadinessSummary(
  recipients: Array<{
    contactId: string;
    contact: {
      id: string;
      phone: string;
      consentStatus: ConsentStatus;
      optedOutAt: Date | null;
      archivedAt: Date | null;
    };
  }>
) {
  const preflight = preflightCampaignRecipients(
    recipients.map((recipient) => recipient.contact),
    recipients.map((recipient) => recipient.contactId)
  );
  const blockReasonLabels = Array.from(
    new Set(preflight.recipients.flatMap((recipient) => recipient.reasons.map(formatCampaignBlockReason)))
  );

  return {
    totalRecipients: preflight.totalRecipients,
    readyRecipients: preflight.allowedRecipients,
    blockedRecipients: preflight.blockedRecipients,
    blockReasonLabels,
    summaryLabel:
      preflight.totalRecipients === 0
        ? "No recipients selected"
        : preflight.blockedRecipients === 0
          ? "All recipients ready"
          : `${preflight.blockedRecipients} need attention`
  };
}

function formatCampaignBlockReason(reason: string) {
  switch (reason) {
    case "CONTACT_ARCHIVED":
      return "Archived contact";
    case "CONSENT_NOT_OPTED_IN":
      return "Missing opt-in";
    case "CONTACT_OPTED_OUT":
      return "Opted out";
    case "CONTACT_NOT_FOUND":
      return "Contact not found";
    default:
      return reason;
  }
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
  const recentDeliveryMessages = campaign.messages.filter((message) => message.direction === "OUTBOUND");
  const deliveryMessages = campaign.deliveryMessages;
  const deliverySummary = getCampaignDeliverySummary(deliveryMessages, {
    recentEvidenceRows: recentDeliveryMessages.length
  });
  const recipientReadiness = getCampaignRecipientReadinessSummary(campaign.recipients);
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
    recipientReadiness,
    recipientReadinessMetrics: productCampaignRecipientReadinessMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: getCampaignRecipientReadinessMetricValue(row.key, recipientReadiness)
    })),
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
    deliveryRows: recentDeliveryMessages.map((message) => ({
      id: message.id,
      contactDisplayName: message.contact
        ? message.contact.displayName ??
          ([message.contact.firstName, message.contact.lastName].filter(Boolean).join(" ") || message.contact.phone)
        : "Unknown contact",
      deliveryState: getCampaignDeliveryState(message),
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
    createdAt?: Date | null;
  }>,
  options: { recentEvidenceRows?: number } = {}
): Record<ProductCampaignDeliveryMetricKey, string> {
  const outboundMessages = messages.filter((message) => message.direction === "OUTBOUND");
  const delivered = outboundMessages.filter(isLocalDeliveryDelivered);
  const failed = outboundMessages.filter(isTerminalDeliveryFailure);
  const pending = outboundMessages.filter(
    (message) => message.deliveredAt === null && !isTerminalDeliveryFailure(message)
  );
  const lastOutboundMessageAt = outboundMessages.reduce<Date | null>((latest, message) => {
    if (!message.createdAt) {
      return latest;
    }

    return latest === null || message.createdAt.getTime() > latest.getTime() ? message.createdAt : latest;
  }, null);
  const providerStatuses = Array.from(new Set(outboundMessages.map((message) => message.providerStatus ?? "local_only")));
  const deliveryRatePercent =
    outboundMessages.length > 0 ? Math.round((delivered.length / outboundMessages.length) * 100) : 0;

  return {
    outboundMessages: outboundMessages.length.toString(),
    recentEvidenceRows: `${options.recentEvidenceRows ?? outboundMessages.length} of ${outboundMessages.length}`,
    deliveryRate: `${deliveryRatePercent}%`,
    delivered: delivered.length.toString(),
    pending: pending.length.toString(),
    failed: failed.length.toString(),
    lastOutboundMessage: lastOutboundMessageAt?.toISOString() ?? "none",
    providerStatuses: providerStatuses.length > 0 ? providerStatuses.join(", ") : "none"
  };
}

function getCampaignDeliveryState(message: {
  providerStatus: string | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
}) {
  if (isLocalDeliveryDelivered(message)) {
    return "delivered";
  }

  if (isTerminalDeliveryFailure(message)) {
    return "failed";
  }

  return "pending";
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
      return recipient.blockReason ? formatCampaignBlockReason(recipient.blockReason) : "none";
  }
}

function getCampaignRecipientReadinessMetricValue(
  key: ProductCampaignRecipientReadinessMetricKey,
  readiness: ReturnType<typeof getCampaignRecipientReadinessSummary>
) {
  switch (key) {
    case "totalRecipients":
      return readiness.totalRecipients.toString();
    case "readyRecipients":
      return readiness.readyRecipients.toString();
    case "blockedRecipients":
      return readiness.blockedRecipients.toString();
    case "blockers":
      return readiness.blockReasonLabels.length > 0 ? readiness.blockReasonLabels.join(" / ") : "No blockers";
  }
}
