import { CampaignStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { orgWhere } from "@/lib/db/tenant";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";
import type { CampaignCreateInput, CampaignUpdateInput } from "@/lib/validation/campaigns";

const campaignInclude = {
  template: true,
  recipients: { include: { contact: true } }
} satisfies Prisma.CampaignInclude;

export async function listCampaigns(orgId: string) {
  return prisma.campaign.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    include: campaignInclude
  });
}

export async function getCampaign(orgId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: orgWhere(orgId, { id: campaignId }),
    include: campaignInclude
  });
}

export async function createCampaign(orgId: string, input: CampaignCreateInput) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        orgId,
        name: input.name,
        body: input.body,
        templateId: input.templateId
      }
    });

    await syncCampaignRecipients(tx, orgId, campaign.id, input.contactIds);
    return tx.campaign.findUniqueOrThrow({ where: { id: campaign.id }, include: campaignInclude });
  });
}

export async function updateCampaign(orgId: string, campaignId: string, input: CampaignUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.campaign.findFirst({ where: orgWhere(orgId, { id: campaignId }) });
    if (!existing) {
      return null;
    }
    if (existing.status !== CampaignStatus.DRAFT) {
      throw new Error("Only draft campaigns can be edited.");
    }

    const campaign = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        name: input.name,
        body: input.body,
        templateId: input.templateId
      }
    });

    if (input.contactIds) {
      await syncCampaignRecipients(tx, orgId, campaign.id, input.contactIds);
    }

    return tx.campaign.findUniqueOrThrow({ where: { id: campaign.id }, include: campaignInclude });
  });
}

export async function preflightCampaign(orgId: string, campaignId: string, contactIds?: string[]) {
  const campaign = await prisma.campaign.findFirst({
    where: orgWhere(orgId, { id: campaignId }),
    include: { recipients: true }
  });

  if (!campaign) {
    return null;
  }

  const selectedContactIds = contactIds ?? campaign.recipients.map((recipient) => recipient.contactId);
  const contacts = await prisma.contact.findMany({
    where: {
      orgId,
      id: { in: selectedContactIds }
    },
    select: {
      id: true,
      phone: true,
      consentStatus: true,
      optedOutAt: true,
      archivedAt: true
    }
  });

  return preflightCampaignRecipients(contacts);
}

async function syncCampaignRecipients(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string,
  contactIds: string[]
) {
  await tx.campaignRecipient.deleteMany({ where: { orgId, campaignId } });

  for (const contactId of [...new Set(contactIds)]) {
    const contact = await tx.contact.findFirst({ where: orgWhere(orgId, { id: contactId }) });
    if (contact) {
      await tx.campaignRecipient.create({ data: { orgId, campaignId, contactId } });
    }
  }
}
