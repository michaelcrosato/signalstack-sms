import { CampaignStatus, ConsentStatus } from "@prisma/client";
import { listCampaigns } from "@/lib/db/repositories/campaigns";
import { listContacts } from "@/lib/db/repositories/contacts";
import { listTemplates } from "@/lib/db/repositories/templates";

export async function getProductCampaigns(orgId: string) {
  const [campaigns, contacts, templates] = await Promise.all([
    listCampaigns(orgId),
    listContacts(orgId),
    listTemplates(orgId)
  ]);

  return {
    summary: {
      total: campaigns.length,
      draft: campaigns.filter((campaign) => campaign.status === CampaignStatus.DRAFT).length,
      scheduled: campaigns.filter((campaign) => campaign.status === CampaignStatus.SCHEDULED).length,
      readyRecipients: contacts.filter((contact) => contact.consentStatus === ConsentStatus.OPTED_IN && !contact.archivedAt)
        .length
    },
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
