import { createHash } from "node:crypto";
import {
  CampaignStatus,
  QueueJobStatus,
  QueueJobType,
  type Prisma,
  type QueueJob
} from "@prisma/client";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";
import { scheduledCampaignIdempotencyKey } from "@/lib/queue/idempotency";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";
import type {
  PublicCampaignCreateInput,
  PublicCampaignUpdateInput
} from "@/lib/validation/public-api-campaigns-conversations";

export const publicCampaignSelect = {
  id: true,
  templateId: true,
  name: true,
  status: true,
  body: true,
  scheduledAt: true,
  createdAt: true,
  updatedAt: true,
  template: { select: { id: true, name: true } },
  _count: { select: { recipients: true, messages: true } }
} satisfies Prisma.CampaignSelect;

type PublicCampaignRow = Prisma.CampaignGetPayload<{ select: typeof publicCampaignSelect }>;

export type PublicCampaignMutationResult<TData> =
  | Readonly<{ ok: true; data: TData }>
  | Readonly<{ ok: false; kind: "not_found" | "operation_not_allowed" }>;

export function serializePublicCampaign(row: PublicCampaignRow) {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    status: row.status,
    template: row.template ? { id: row.template.id, name: row.template.name } : null,
    recipientCount: row._count.recipients,
    messageCount: row._count.messages,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicCampaignQueueJob(
  row: Pick<QueueJob, "id" | "status" | "runAt" | "generation" | "createdAt" | "updatedAt">
) {
  return {
    id: row.id,
    status: row.status,
    runAt: row.runAt.toISOString(),
    generation: row.generation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function createPublicCampaign(
  tx: Prisma.TransactionClient,
  orgId: string,
  input: PublicCampaignCreateInput
): Promise<PublicCampaignMutationResult<ReturnType<typeof serializePublicCampaign>>> {
  const contactIds = uniqueIds(input.contactIds);
  if (!(await campaignReferencesBelongToTenant(tx, orgId, input.templateId, contactIds))) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  const campaign = await tx.campaign.create({
    data: {
      orgId,
      name: input.name,
      body: input.body,
      templateId: input.templateId
    },
    select: { id: true }
  });
  await replaceCampaignRecipients(tx, orgId, campaign.id, contactIds);
  return Object.freeze({
    ok: true,
    data: serializePublicCampaign(await readCampaign(tx, orgId, campaign.id))
  });
}

export async function updatePublicCampaign(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string,
  input: PublicCampaignUpdateInput
): Promise<PublicCampaignMutationResult<ReturnType<typeof serializePublicCampaign>>> {
  const existing = await tx.campaign.findFirst({
    where: { orgId, id: campaignId },
    select: { id: true, status: true }
  });
  if (!existing) {
    return Object.freeze({ ok: false, kind: "not_found" });
  }
  if (existing.status !== CampaignStatus.DRAFT) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  const contactIds = input.contactIds === undefined ? undefined : uniqueIds(input.contactIds);
  if (!(await campaignReferencesBelongToTenant(tx, orgId, input.templateId, contactIds))) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  const updated = await tx.campaign.updateMany({
    where: { orgId, id: campaignId, status: CampaignStatus.DRAFT },
    data: {
      name: input.name,
      body: input.body,
      templateId: input.templateId
    }
  });
  if (updated.count !== 1) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }
  if (contactIds) {
    await replaceCampaignRecipients(tx, orgId, campaignId, contactIds);
  }

  return Object.freeze({
    ok: true,
    data: serializePublicCampaign(await readCampaign(tx, orgId, campaignId))
  });
}

export async function schedulePublicCampaign(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string,
  scheduledAt: Date
): Promise<
  PublicCampaignMutationResult<
    Readonly<{
      campaign: ReturnType<typeof serializePublicCampaign>;
      queueJob: ReturnType<typeof serializePublicCampaignQueueJob>;
    }>
  >
> {
  await lockCampaign(tx, orgId, campaignId);
  const campaign = await tx.campaign.findFirst({
    where: { orgId, id: campaignId },
    include: { recipients: { where: { orgId }, select: { contactId: true } } }
  });
  if (!campaign) {
    return Object.freeze({ ok: false, kind: "not_found" });
  }
  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.PAUSED) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  await lockCampaignQueueJobs(tx, orgId, campaignId);
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
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  const recipientIds = campaign.recipients.map((recipient) => recipient.contactId);
  const contacts = await tx.contact.findMany({
    where: { orgId, id: { in: recipientIds } },
    select: {
      id: true,
      phone: true,
      consentStatus: true,
      optedOutAt: true,
      archivedAt: true
    }
  });
  if (!preflightCampaignRecipients(contacts, recipientIds).allowed) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  const idempotencyKey = scheduledCampaignIdempotencyKey(orgId, campaignId, scheduledAt);
  const payload = scheduledCampaignJobSchema.parse({
    version: 1,
    orgId,
    campaignId,
    scheduledAt: scheduledAt.toISOString()
  });
  const existingQueueJob = await tx.queueJob.findUnique({
    where: { orgId_idempotencyKey: { orgId, idempotencyKey } }
  });
  if (
    existingQueueJob &&
    existingQueueJob.status !== QueueJobStatus.QUEUED &&
    existingQueueJob.status !== QueueJobStatus.CANCELLED &&
    existingQueueJob.status !== QueueJobStatus.FAILED
  ) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  await tx.queueJob.updateMany({
    where: {
      orgId,
      campaignId,
      status: QueueJobStatus.QUEUED,
      idempotencyKey: { not: idempotencyKey }
    },
    data: {
      status: QueueJobStatus.CANCELLED,
      processingToken: null,
      processingExpiresAt: null
    }
  });
  await tx.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.SCHEDULED, scheduledAt }
  });

  const queueJob = await upsertScheduledCampaignQueueJob(tx, {
    orgId,
    campaignId,
    idempotencyKey,
    payload,
    scheduledAt,
    existing: existingQueueJob
  });

  await enqueueCustomerWebhookEvent(tx, {
    orgId,
    deduplicationKey: eventDeduplicationKey("campaign.scheduled", [
      campaignId,
      queueJob.id,
      queueJob.generation.toString()
    ]),
    type: "campaign.scheduled",
    aggregateType: "campaign",
    aggregateId: campaignId,
    data: {
      campaignId,
      queueJobId: queueJob.id,
      scheduledAt: scheduledAt.toISOString(),
      status: CampaignStatus.SCHEDULED
    }
  });

  return Object.freeze({
    ok: true,
    data: Object.freeze({
      campaign: serializePublicCampaign(await readCampaign(tx, orgId, campaignId)),
      queueJob: serializePublicCampaignQueueJob(queueJob)
    })
  });
}

export async function cancelPublicCampaign(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string
): Promise<PublicCampaignMutationResult<ReturnType<typeof serializePublicCampaign>>> {
  const initialCampaign = await tx.campaign.findFirst({
    where: { orgId, id: campaignId },
    select: { id: true, status: true }
  });
  if (!initialCampaign) {
    return Object.freeze({ ok: false, kind: "not_found" });
  }
  if (initialCampaign.status !== CampaignStatus.SCHEDULED) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  // Keep the queue-row-first lock order used by the worker/cancellation race boundary, then
  // re-read the campaign under lock before changing either side of the transition.
  await lockCampaignQueueJobs(tx, orgId, campaignId);
  await lockCampaign(tx, orgId, campaignId);
  const campaign = await tx.campaign.findFirst({
    where: { orgId, id: campaignId },
    select: { id: true, status: true, scheduledAt: true }
  });
  if (!campaign) {
    return Object.freeze({ ok: false, kind: "not_found" });
  }
  if (campaign.status !== CampaignStatus.SCHEDULED) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
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
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }
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

  const paused = await tx.campaign.updateMany({
    where: { orgId, id: campaignId, status: CampaignStatus.SCHEDULED },
    data: { status: CampaignStatus.PAUSED }
  });
  if (paused.count !== 1) {
    throw new Error("The locked campaign cancellation transition failed.");
  }

  const canceledJob = await tx.queueJob.findFirst({
    where: {
      orgId,
      campaignId,
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: QueueJobStatus.CANCELLED
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { id: true, generation: true }
  });
  const transitionIdentity = canceledJob
    ? `${canceledJob.id}:${canceledJob.generation}`
    : campaign.scheduledAt?.toISOString() ?? "unscheduled";
  await enqueueCustomerWebhookEvent(tx, {
    orgId,
    deduplicationKey: eventDeduplicationKey("campaign.canceled", [
      campaignId,
      transitionIdentity
    ]),
    type: "campaign.canceled",
    aggregateType: "campaign",
    aggregateId: campaignId,
    data: { campaignId, status: CampaignStatus.PAUSED }
  });

  return Object.freeze({
    ok: true,
    data: serializePublicCampaign(await readCampaign(tx, orgId, campaignId))
  });
}

async function campaignReferencesBelongToTenant(
  tx: Prisma.TransactionClient,
  orgId: string,
  templateId: string | undefined,
  contactIds: readonly string[] | undefined
): Promise<boolean> {
  if (templateId) {
    const template = await tx.messageTemplate.findFirst({
      where: { orgId, id: templateId },
      select: { id: true }
    });
    if (!template) return false;
  }
  if (contactIds && contactIds.length > 0) {
    const contacts = await tx.contact.findMany({
      where: { orgId, id: { in: [...contactIds] } },
      select: { id: true }
    });
    if (contacts.length !== contactIds.length) return false;
  }
  return true;
}

async function replaceCampaignRecipients(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string,
  contactIds: readonly string[]
): Promise<void> {
  await tx.campaignRecipient.deleteMany({ where: { orgId, campaignId } });
  if (contactIds.length > 0) {
    await tx.campaignRecipient.createMany({
      data: contactIds.map((contactId) => ({ orgId, campaignId, contactId }))
    });
  }
}

async function readCampaign(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string
): Promise<PublicCampaignRow> {
  return tx.campaign.findFirstOrThrow({
    where: { orgId, id: campaignId },
    select: {
      ...publicCampaignSelect
    }
  });
}

async function lockCampaign(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM "Campaign"
    WHERE "orgId" = ${orgId} AND id = ${campaignId}
    FOR UPDATE
  `;
}

async function lockCampaignQueueJobs(
  tx: Prisma.TransactionClient,
  orgId: string,
  campaignId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM "QueueJob"
    WHERE "orgId" = ${orgId}
      AND "campaignId" = ${campaignId}
      AND type = ${QueueJobType.SCHEDULED_CAMPAIGN}::"QueueJobType"
    FOR UPDATE
  `;
}

async function upsertScheduledCampaignQueueJob(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    campaignId: string;
    idempotencyKey: string;
    payload: Prisma.InputJsonValue;
    scheduledAt: Date;
    existing: QueueJob | null;
  }>
): Promise<QueueJob> {
  if (!input.existing) {
    return tx.queueJob.create({
      data: {
        orgId: input.orgId,
        campaignId: input.campaignId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        runAt: input.scheduledAt
      }
    });
  }

  const reopened = await tx.queueJob.updateMany({
    where: {
      id: input.existing.id,
      orgId: input.orgId,
      campaignId: input.campaignId,
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: {
        in: [QueueJobStatus.QUEUED, QueueJobStatus.CANCELLED, QueueJobStatus.FAILED]
      }
    },
    data: {
      status: QueueJobStatus.QUEUED,
      payload: input.payload,
      runAt: input.scheduledAt,
      generation: { increment: 1 },
      processingToken: null,
      processingExpiresAt: null
    }
  });
  if (reopened.count !== 1) {
    throw new Error("The locked campaign queue transition failed.");
  }
  return tx.queueJob.findUniqueOrThrow({ where: { id: input.existing.id } });
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function eventDeduplicationKey(type: string, components: readonly string[]): string {
  const digest = createHash("sha256")
    .update(`signalstack/public-campaign-event/v1\0${type}\0${components.join("\0")}`, "utf8")
    .digest("base64url");
  return `api:${type}:${digest}`;
}
