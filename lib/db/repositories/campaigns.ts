import { CampaignStatus, QueueJobStatus, QueueJobType, type Prisma, type QueueJob } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";
import { orgWhere } from "@/lib/db/tenant";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";
import { scheduledCampaignIdempotencyKey } from "@/lib/queue/idempotency";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";
import type { CampaignCreateInput, CampaignUpdateInput } from "@/lib/validation/campaigns";
import { evaluateSegmentContacts, type SegmentFilter } from "@/lib/db/repositories/segments";

function campaignListInclude(orgId: string) {
  return {
    template: { where: { orgId } },
    recipients: {
      where: { orgId, contact: { orgId } },
      include: { contact: true }
    }
  } satisfies Prisma.CampaignInclude;
}

function campaignListDeliveryInclude(orgId: string) {
  return {
    template: { where: { orgId } },
    recipients: {
      where: { orgId, contact: { orgId } },
      include: { contact: true }
    },
    messages: {
      where: { orgId, direction: "OUTBOUND" },
      select: {
        direction: true,
        providerStatus: true,
        deliveredAt: true,
        failedAt: true,
        createdAt: true
      }
    }
  } satisfies Prisma.CampaignInclude;
}

function campaignDetailInclude(orgId: string) {
  return {
    template: { where: { orgId } },
    recipients: {
      where: { orgId, contact: { orgId } },
      include: { contact: true }
    },
    messages: {
      where: { orgId, direction: "OUTBOUND" },
      include: { contact: { where: { orgId } } },
      orderBy: { createdAt: "desc" },
      take: 30
    }
  } satisfies Prisma.CampaignInclude;
}

const campaignDetailDeliveryMessageSelect = {
  direction: true,
  providerStatus: true,
  providerErrorCode: true,
  deliveredAt: true,
  failedAt: true,
  createdAt: true
} satisfies Prisma.MessageSelect;

export async function listCampaigns(orgId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.campaign.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    include: campaignListInclude(orgId)
  }));
}

export async function listCampaignsWithDelivery(orgId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.campaign.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    include: campaignListDeliveryInclude(orgId)
  }));
}

export async function getCampaign(orgId: string, campaignId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.campaign.findFirst({
    where: orgWhere(orgId, { id: campaignId }),
    include: campaignListInclude(orgId)
  }));
}

export async function getCampaignWithMessages(orgId: string, campaignId: string) {
  return withTenantTransaction({ orgId }, async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: orgWhere(orgId, { id: campaignId }),
      include: campaignDetailInclude(orgId)
    });

    if (!campaign) {
      return null;
    }

    const deliveryMessages = await tx.message.findMany({
      where: orgWhere(orgId, { campaignId, direction: "OUTBOUND" }),
      orderBy: { createdAt: "asc" },
      select: campaignDetailDeliveryMessageSelect
    });

    return {
      ...campaign,
      deliveryMessages
    };
  });
}

export async function createCampaign(orgId: string, input: CampaignCreateInput) {
  return withTenantTransaction({ orgId }, async (tx) => {
    await assertCampaignTemplateBelongsToOrg(tx, orgId, input.templateId);

    const campaign = await tx.campaign.create({
      data: {
        orgId,
        name: input.name,
        body: input.body,
        templateId: input.templateId
      }
    });

    await syncCampaignRecipients(tx, orgId, campaign.id, input.contactIds);
    return tx.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
      include: campaignListInclude(orgId)
    });
  });
}

export async function updateCampaign(orgId: string, campaignId: string, input: CampaignUpdateInput) {
  return withTenantTransaction({ orgId }, async (tx) => {
    const existing = await tx.campaign.findFirst({ where: orgWhere(orgId, { id: campaignId }) });
    if (!existing) {
      return null;
    }
    if (existing.status !== CampaignStatus.DRAFT) {
      throw new Error("Only draft campaigns can be edited.");
    }
    await assertCampaignTemplateBelongsToOrg(tx, orgId, input.templateId);

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

    return tx.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
      include: campaignListInclude(orgId)
    });
  });
}

export async function snapshotCampaignAudience(
  orgId: string,
  campaignId: string,
  filter: SegmentFilter,
  existingTx?: Prisma.TransactionClient
) {
  const execute = async (tx: Prisma.TransactionClient) => {
    const contacts = await evaluateSegmentContacts(orgId, filter, tx);
    const contactIds = contacts.map((c) => c.id);
    await syncCampaignRecipients(tx, orgId, campaignId, contactIds);
    return tx.campaignRecipient.findMany({
      where: { orgId, campaignId },
      include: { contact: true }
    });
  };

  return existingTx ? execute(existingTx) : withTenantTransaction({ orgId }, execute);
}

export async function preflightCampaign(
  orgId: string,
  campaignId: string,
  contactIds?: string[],
  options?: { now?: Date }
) {
  return withTenantTransaction({ orgId }, async (tx) => {
    const [campaign, organization] = await Promise.all([
      tx.campaign.findFirst({
        where: orgWhere(orgId, { id: campaignId }),
        include: { recipients: { where: { orgId } } }
      }),
      typeof tx.organization?.findFirst === "function"
        ? tx.organization.findFirst({
            where: { id: orgId },
            select: { timezone: true }
          })
        : Promise.resolve(null)
    ]);

    if (!campaign) {
      return null;
    }

    const selectedContactIds = contactIds ?? campaign.recipients.map((recipient) => recipient.contactId);
    const contacts = await tx.contact.findMany({
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

    return preflightCampaignRecipients(contacts, selectedContactIds, {
      now: options?.now ?? new Date(),
      timeZone: organization?.timezone,
      checkQuietHours: true
    });
  });
}

export async function scheduleCampaign(orgId: string, campaignId: string, scheduledAt: Date) {
  return withTenantTransaction({ orgId }, async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: orgWhere(orgId, { id: campaignId }),
      include: { recipients: { where: { orgId } } }
    });

    if (!campaign) {
      return null;
    }
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.PAUSED) {
      throw new Error("Only draft or paused campaigns can be scheduled.");
    }

    const processingJob = await tx.queueJob.findFirst({
      where: {
        orgId,
        campaignId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING
      },
      select: { id: true }
    });
    if (processingJob) {
      throw new Error("Campaign schedule is already processing.");
    }

    const [organization, contacts] = await Promise.all([
      typeof tx.organization?.findFirst === "function"
        ? tx.organization.findFirst({ where: { id: orgId }, select: { timezone: true } })
        : Promise.resolve(null),
      tx.contact.findMany({
        where: { orgId, id: { in: campaign.recipients.map((recipient) => recipient.contactId) } },
        select: { id: true, phone: true, consentStatus: true, optedOutAt: true, archivedAt: true }
      })
    ]);
    const preflight = preflightCampaignRecipients(
      contacts,
      campaign.recipients.map((recipient) => recipient.contactId),
      { now: scheduledAt, timeZone: organization?.timezone, checkQuietHours: true }
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

    const queueJobWhere = { orgId_idempotencyKey: { orgId, idempotencyKey } };
    const existingQueueJob = await tx.queueJob.findUnique({ where: queueJobWhere });
    let queueJob: QueueJob;
    if (existingQueueJob) {
      const reopened = await tx.queueJob.updateMany({
        where: {
          id: existingQueueJob.id,
          orgId,
          type: QueueJobType.SCHEDULED_CAMPAIGN,
          status: {
            in: [QueueJobStatus.QUEUED, QueueJobStatus.CANCELLED, QueueJobStatus.FAILED]
          }
        },
        data: {
          status: QueueJobStatus.QUEUED,
          payload,
          runAt: scheduledAt,
          generation: { increment: 1 },
          processingToken: null,
          processingExpiresAt: null
        }
      });
      if (reopened.count !== 1) {
        throw new Error("Campaign schedule is already processing or complete.");
      }
      queueJob = await tx.queueJob.findUniqueOrThrow({ where: { id: existingQueueJob.id } });
    } else {
      queueJob = await tx.queueJob.create({
        data: {
          orgId,
          campaignId,
          type: QueueJobType.SCHEDULED_CAMPAIGN,
          status: QueueJobStatus.QUEUED,
          idempotencyKey,
          payload,
          runAt: scheduledAt
        }
      });
    }

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
  return withTenantTransaction({ orgId }, async (tx) => {
    const campaign = await tx.campaign.findFirst({ where: orgWhere(orgId, { id: campaignId }) });
    if (!campaign) {
      return null;
    }
    if (campaign.status !== CampaignStatus.SCHEDULED) {
      throw new Error("Only scheduled campaigns can be canceled.");
    }

    // Cancel queued work first so the row locks form the serialization boundary
    // with a concurrent QUEUED -> PROCESSING claim. If the worker already won,
    // the update skips that row and the subsequent fresh read observes PROCESSING.
    await tx.queueJob.updateMany({
      where: {
        orgId,
        campaignId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED
      },
      data: {
        status: QueueJobStatus.CANCELLED,
        processingToken: null,
        processingExpiresAt: null
      }
    });

    const processingJob = await tx.queueJob.findFirst({
      where: {
        orgId,
        campaignId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING
      },
      select: { id: true }
    });
    if (processingJob) {
      throw new Error("A processing campaign cannot be canceled.");
    }

    const paused = await tx.campaign.updateMany({
      where: { id: campaignId, orgId, status: CampaignStatus.SCHEDULED },
      data: { status: CampaignStatus.PAUSED }
    });
    if (paused.count !== 1) {
      throw new Error("Campaign cancellation conflicted with another transition.");
    }

    const pausedCampaign = await tx.campaign.findFirstOrThrow({ where: orgWhere(orgId, { id: campaignId }) });
    recordMetric(smsPipelineMetrics.queueThroughput, { action: "cancel", status: "success", backend: "database" });
    return pausedCampaign;
  });
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

async function assertCampaignTemplateBelongsToOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  templateId: string | undefined
) {
  if (templateId === undefined) {
    return;
  }

  const template = await tx.messageTemplate.findFirst({
    where: orgWhere(orgId, { id: templateId }),
    select: { id: true }
  });
  if (!template) {
    throw new Error("Campaign template not found.");
  }
}
