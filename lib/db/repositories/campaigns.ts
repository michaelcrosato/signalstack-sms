import { CampaignStatus, QueueJobStatus, QueueJobType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";
import { orgWhere } from "@/lib/db/tenant";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";
import { scheduledCampaignIdempotencyKey } from "@/lib/queue/idempotency";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";
import type { CampaignCreateInput, CampaignUpdateInput } from "@/lib/validation/campaigns";

const campaignListInclude = {
  template: true,
  recipients: { include: { contact: true } }
} satisfies Prisma.CampaignInclude;

const campaignListDeliveryInclude = {
  template: true,
  recipients: { include: { contact: true } },
  messages: {
    where: { direction: "OUTBOUND" },
    select: {
      direction: true,
      providerStatus: true,
      deliveredAt: true,
      failedAt: true,
      createdAt: true
    }
  }
} satisfies Prisma.CampaignInclude;

const campaignDetailInclude = {
  template: true,
  recipients: { include: { contact: true } },
  messages: {
    where: { direction: "OUTBOUND" },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
    take: 30
  }
} satisfies Prisma.CampaignInclude;

const campaignDetailDeliveryMessageSelect = {
  direction: true,
  providerStatus: true,
  providerErrorCode: true,
  deliveredAt: true,
  failedAt: true,
  createdAt: true
} satisfies Prisma.MessageSelect;

export async function listCampaigns(orgId: string) {
  return prisma.campaign.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    include: campaignListInclude
  });
}

export async function listCampaignsWithDelivery(orgId: string) {
  return prisma.campaign.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    include: campaignListDeliveryInclude
  });
}

export async function getCampaign(orgId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: orgWhere(orgId, { id: campaignId }),
    include: campaignListInclude
  });
}

export async function getCampaignWithMessages(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: orgWhere(orgId, { id: campaignId }),
    include: campaignDetailInclude
  });

  if (!campaign) {
    return null;
  }

  const deliveryMessages = await prisma.message.findMany({
    where: orgWhere(orgId, { campaignId, direction: "OUTBOUND" }),
    orderBy: { createdAt: "asc" },
    select: campaignDetailDeliveryMessageSelect
  });

  return {
    ...campaign,
    deliveryMessages
  };
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
    return tx.campaign.findUniqueOrThrow({ where: { id: campaign.id }, include: campaignListInclude });
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

    return tx.campaign.findUniqueOrThrow({ where: { id: campaign.id }, include: campaignListInclude });
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

  return preflightCampaignRecipients(contacts, selectedContactIds);
}

export async function scheduleCampaign(orgId: string, campaignId: string, scheduledAt: Date) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: orgWhere(orgId, { id: campaignId }),
      include: { recipients: true }
    });

    if (!campaign) {
      return null;
    }
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.PAUSED) {
      throw new Error("Only draft or paused campaigns can be scheduled.");
    }

    const contacts = await tx.contact.findMany({
      where: { orgId, id: { in: campaign.recipients.map((recipient) => recipient.contactId) } },
      select: { id: true, phone: true, consentStatus: true, optedOutAt: true, archivedAt: true }
    });
    const preflight = preflightCampaignRecipients(
      contacts,
      campaign.recipients.map((recipient) => recipient.contactId)
    );
    if (!preflight.allowed) {
      throw new Error("Campaign preflight failed.");
    }

    const idempotencyKey = scheduledCampaignIdempotencyKey(orgId, campaignId, scheduledAt);
    const payload = scheduledCampaignJobSchema.parse({
      version: 1,
      orgId,
      campaignId,
      scheduledAt: scheduledAt.toISOString()
    });

    await tx.queueJob.updateMany({
      where: {
        orgId,
        campaignId,
        status: QueueJobStatus.QUEUED,
        idempotencyKey: { not: idempotencyKey }
      },
      data: { status: QueueJobStatus.CANCELLED }
    });

    await tx.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.SCHEDULED, scheduledAt }
    });

    const queueJob = await tx.queueJob.upsert({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      update: {
        status: QueueJobStatus.QUEUED,
        payload,
        runAt: scheduledAt
      },
      create: {
        orgId,
        campaignId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED,
        idempotencyKey,
        payload,
        runAt: scheduledAt
      }
    });

    const depth = typeof tx.queueJob.count === "function"
      ? await tx.queueJob.count({
          where: { orgId, status: QueueJobStatus.QUEUED }
        })
      : 0;
    recordMetric(smsPipelineMetrics.queueDepth, { depth, backend: "database" });
    recordMetric(smsPipelineMetrics.queueThroughput, { action: "enqueue", status: "success", backend: "database" });

    return queueJob;
  });
}

export async function cancelCampaign(orgId: string, campaignId: string) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({ where: orgWhere(orgId, { id: campaignId }) });
    if (!campaign) {
      return null;
    }
    if (campaign.status !== CampaignStatus.SCHEDULED) {
      throw new Error("Only scheduled campaigns can be canceled.");
    }

    await tx.queueJob.updateMany({
      where: { orgId, campaignId, status: QueueJobStatus.QUEUED },
      data: { status: QueueJobStatus.CANCELLED }
    });

    recordMetric(smsPipelineMetrics.queueThroughput, { action: "cancel", status: "success", backend: "database" });

    return tx.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.PAUSED }
    });
  });
}

async function syncCampaignRecipients(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string,
  contactIds: string[]
) {
  await tx.campaignRecipient.deleteMany({ where: { orgId, campaignId } });

  const uniqueContactIds = [...new Set(contactIds)];
  if (uniqueContactIds.length === 0) return;

  const existingContacts = await tx.contact.findMany({
    where: orgWhere(orgId, { id: { in: uniqueContactIds } }),
    select: { id: true }
  });

  if (existingContacts.length > 0) {
    await tx.campaignRecipient.createMany({
      data: existingContacts.map((contact) => ({
        orgId,
        campaignId,
        contactId: contact.id
      }))
    });
  }
}
