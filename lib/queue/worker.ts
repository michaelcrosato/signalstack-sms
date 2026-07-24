import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import {
  CampaignRecipientStatus,
  CampaignStatus,
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  QueueJobStatus,
  QueueJobType,
  type Contact,
  type QueueJob
} from "@prisma/client";
import { claimDueScheduledCampaignQueueJobs, type ScheduledCampaignQueueJobClaim } from "@/lib/db/queue-dispatch";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { environmentIsProductionLike } from "@/lib/deployment/production-gate";
import { dummyProvider } from "@/lib/messaging/provider/dummy-provider";
import { renderTemplate } from "@/lib/messaging/render-template";
import {
  checkCampaignWorkerKillSwitch,
  checkProviderRateLimit,
  isWorkerShutdownRequested,
  liveWorkerDeploymentClassIsAuthorized,
  recordWorkerHeartbeat
} from "@/lib/queue/live-worker-controls";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";
import { outboundCampaignMessageIdempotencyKey } from "@/lib/queue/idempotency";
import { QUEUE_JOB_PROCESSING_LEASE_MS } from "@/lib/queue/claim-lease";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

export type WorkerSafetyInput = {
  liveMessagingEnabled?: unknown;
  messagingProvider?: unknown;
  workerDeploymentClass?: unknown;
  nodeEnv?: unknown;
  vercelEnv?: unknown;
  deploymentEnv?: unknown;
  appEnv?: unknown;
};

export type WorkerMode = "once" | "continuous";

export type WorkerRuntimeOptions = {
  mode: WorkerMode;
  pollIntervalMs: number;
  maxJobsPerPoll: number;
  maxIterations?: number;
};

export type WorkerRunResult = Awaited<ReturnType<typeof processDueScheduledCampaignJobs>>;

export type ScheduledCampaignQueueJobReference = Readonly<{
  queueJobId: string;
  expectedOrgId: string;
}>;

export type SingleQueueJobProcessResult = {
  processed: 0 | 1;
  skipped: 0 | 1;
  blocked: boolean;
  reason?:
    | "provider-blocked"
    | "production-worker-blocked"
    | "missing-job"
    | "org-mismatch"
    | "already-claimed"
    | "not-due"
    | "invalid-payload"
    | "invalid-campaign"
    | "stale-schedule"
    | "send-preflight-failed"
    | "processing-failed"
    | "emergency-kill-switch-active"
    | "worker-shutdown-requested";
};

export type WorkerReadinessResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "provider-blocked" | "production-worker-blocked";
    };

export type ContinuousWorkerInput = {
  pollIntervalMs: number;
  maxJobsPerPoll: number;
  maxIterations?: number;
  shouldContinue?: () => boolean;
  onResult?: (result: WorkerRunResult, iteration: number) => void;
};

const DEFAULT_WORKER_POLL_INTERVAL_MS = 5000;
const MIN_WORKER_POLL_INTERVAL_MS = 1000;
const DEFAULT_WORKER_MAX_JOBS_PER_POLL = 25;
const MIN_WORKER_MAX_JOBS_PER_POLL = 1;
const MAX_WORKER_MAX_JOBS_PER_POLL = 100;
export const supportedWorkerDeploymentClasses = Object.freeze(["local-demo"] as const);

type ClaimedQueueJob = QueueJob & {
  processingToken: string;
  processingExpiresAt: Date;
};

function liveMessagingFlagIsDisabled(value: unknown) {
  return value === undefined || value === "" || value === "false";
}

export function localWorkerProviderIsAllowed(input: WorkerSafetyInput) {
  return liveMessagingFlagIsDisabled(input.liveMessagingEnabled) && (input.messagingProvider ?? "dummy") === "dummy";
}

export function workerDeploymentClassIsAllowed(input: WorkerSafetyInput) {
  return (
    input.workerDeploymentClass === undefined ||
    input.workerDeploymentClass === "" ||
    supportedWorkerDeploymentClasses.includes(input.workerDeploymentClass as "local-demo") ||
    liveWorkerDeploymentClassIsAuthorized({ workerDeploymentClass: input.workerDeploymentClass })
  );
}

function stringEnvValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function localWorkerReadiness(input: WorkerSafetyInput): WorkerReadinessResult {
  if (
    environmentIsProductionLike({
      NODE_ENV: stringEnvValue(input.nodeEnv),
      VERCEL_ENV: stringEnvValue(input.vercelEnv),
      DEPLOYMENT_ENV: stringEnvValue(input.deploymentEnv),
      APP_ENV: stringEnvValue(input.appEnv)
    })
  ) {
    return { allowed: false, reason: "production-worker-blocked" };
  }

  if (!workerDeploymentClassIsAllowed(input)) {
    return { allowed: false, reason: "production-worker-blocked" };
  }

  if (!localWorkerProviderIsAllowed(input)) {
    return { allowed: false, reason: "provider-blocked" };
  }

  return { allowed: true };
}

function currentWorkerReadiness() {
  return localWorkerReadiness({
    liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED,
    messagingProvider: process.env.MESSAGING_PROVIDER,
    workerDeploymentClass: process.env.WORKER_DEPLOYMENT_CLASS,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    deploymentEnv: process.env.DEPLOYMENT_ENV,
    appEnv: process.env.APP_ENV
  });
}

function parsePositiveInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseWorkerRuntimeOptions(input: { argv?: string[]; env?: Record<string, string | undefined> } = {}): WorkerRuntimeOptions {
  const argv = input.argv ?? [];
  const env = input.env ?? process.env;
  const explicitOnce = argv.includes("--once") || env.WORKER_MODE === "once";
  const explicitContinuous =
    argv.includes("--watch") || argv.includes("--continuous") || env.WORKER_MODE === "continuous";
  const pollIntervalMs = Math.max(
    parsePositiveInteger(env.WORKER_POLL_INTERVAL_MS) ?? DEFAULT_WORKER_POLL_INTERVAL_MS,
    MIN_WORKER_POLL_INTERVAL_MS
  );
  const maxJobsPerPoll = Math.min(
    Math.max(
      parsePositiveInteger(env.WORKER_MAX_JOBS_PER_POLL) ?? DEFAULT_WORKER_MAX_JOBS_PER_POLL,
      MIN_WORKER_MAX_JOBS_PER_POLL
    ),
    MAX_WORKER_MAX_JOBS_PER_POLL
  );
  const maxIterations = parsePositiveInteger(env.WORKER_MAX_ITERATIONS);

  return {
    mode: explicitContinuous && !explicitOnce ? "continuous" : "once",
    pollIntervalMs,
    maxJobsPerPoll,
    ...(maxIterations ? { maxIterations } : {})
  };
}

export function campaignMessageValues(contact: {
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
}) {
  return {
    phone: contact.phone,
    email: contact.email ?? "",
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    displayName: contact.displayName ?? contact.firstName ?? contact.phone
  };
}

export function scheduledCampaignSendIsAllowed(
  contacts: Array<Pick<Contact, "id" | "phone" | "consentStatus" | "optedOutAt" | "archivedAt">>
) {
  return preflightCampaignRecipients(contacts, undefined, { now: new Date(), checkQuietHours: true }).allowed;
}

async function claimScheduledCampaignQueueJob(
  reference: ScheduledCampaignQueueJobReference,
  now: Date
) {
  return withTenantTransaction({ orgId: reference.expectedOrgId }, async (tx) => {
    const candidate = await tx.queueJob.findFirst({
      where: {
        id: reference.queueJobId,
        orgId: reference.expectedOrgId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: { in: [QueueJobStatus.QUEUED, QueueJobStatus.PROCESSING] }
      }
    });

    if (!candidate) {
      return { claimed: false, reason: "missing-job" } as const;
    }
    if (candidate.orgId !== reference.expectedOrgId) {
      return { claimed: false, reason: "org-mismatch" } as const;
    }
    if (candidate.runAt.getTime() > now.getTime()) {
      return { claimed: false, reason: "not-due" } as const;
    }

    const processingToken = randomUUID();
    const processingExpiresAt = new Date(now.getTime() + QUEUE_JOB_PROCESSING_LEASE_MS);
    const claim = await tx.queueJob.updateMany({
      where: {
        id: candidate.id,
        orgId: reference.expectedOrgId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        runAt: { lte: now },
        OR: [
          { status: QueueJobStatus.QUEUED },
          {
            status: QueueJobStatus.PROCESSING,
            OR: [
              { processingToken: null },
              { processingExpiresAt: null },
              { processingExpiresAt: { lte: now } }
            ]
          }
        ]
      },
      data: {
        status: QueueJobStatus.PROCESSING,
        processingToken,
        processingExpiresAt
      }
    });

    if (claim.count !== 1) {
      return { claimed: false, reason: "already-claimed" } as const;
    }

    return {
      claimed: true,
      job: {
        ...candidate,
        status: QueueJobStatus.PROCESSING,
        processingToken,
        processingExpiresAt
      } as ClaimedQueueJob
    } as const;
  });
}

async function renewClaimedQueueJob(job: ClaimedQueueJob, now = new Date()) {
  const processingExpiresAt = new Date(now.getTime() + QUEUE_JOB_PROCESSING_LEASE_MS);
  const renewed = await withTenantTransaction({ orgId: job.orgId }, (tx) => tx.queueJob.updateMany({
    where: {
      id: job.id,
      orgId: job.orgId,
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: QueueJobStatus.PROCESSING,
      processingToken: job.processingToken
    },
    data: { processingExpiresAt }
  }));

  if (renewed.count !== 1) {
    throw new Error("Queue job processing claim was lost.");
  }

  job.processingExpiresAt = processingExpiresAt;
}

async function transitionClaimedQueueJob(job: ClaimedQueueJob, status: QueueJobStatus) {
  const transitioned = await withTenantTransaction({ orgId: job.orgId }, (tx) => tx.queueJob.updateMany({
    where: {
      id: job.id,
      orgId: job.orgId,
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: QueueJobStatus.PROCESSING,
      processingToken: job.processingToken
    },
    data: {
      status,
      processingToken: null,
      processingExpiresAt: null
    }
  }));

  if (transitioned.count !== 1) {
    throw new Error("Queue job processing claim was lost before transition.");
  }

  return transitioned;
}

async function transitionClaimedQueueJobWithCampaign(
  job: ClaimedQueueJob,
  input: {
    queueStatus: QueueJobStatus;
    campaignId: string;
    campaignStatus: CampaignStatus;
    scheduledAt: Date;
    requireCampaignTransition: boolean;
  }
) {
  await withTenantTransaction({ orgId: job.orgId }, async (tx) => {
    const transitioned = await tx.queueJob.updateMany({
      where: {
        id: job.id,
        orgId: job.orgId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING,
        processingToken: job.processingToken
      },
      data: {
        status: input.queueStatus,
        processingToken: null,
        processingExpiresAt: null
      }
    });

    if (transitioned.count !== 1) {
      throw new Error("Queue job processing claim was lost before transition.");
    }

    const campaignTransition = await tx.campaign.updateMany({
      where: {
        id: input.campaignId,
        orgId: job.orgId,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: input.scheduledAt
      },
      data: { status: input.campaignStatus }
    });

    if (input.requireCampaignTransition && campaignTransition.count !== 1) {
      throw new Error("Campaign schedule changed before queue completion.");
    }
  });
}

async function failClaimedQueueJob(
  job: ClaimedQueueJob,
  options: { requireCampaignTransition?: boolean } = {}
) {
  const payload = scheduledCampaignJobSchema.safeParse(job.payload);

  try {
    if (
      payload.success &&
      job.campaignId === payload.data.campaignId &&
      job.orgId === payload.data.orgId
    ) {
      await transitionClaimedQueueJobWithCampaign(job, {
        queueStatus: QueueJobStatus.FAILED,
        campaignId: payload.data.campaignId,
        campaignStatus: CampaignStatus.PAUSED,
        scheduledAt: new Date(payload.data.scheduledAt),
        requireCampaignTransition: options.requireCampaignTransition ?? false
      });
    } else {
      await transitionClaimedQueueJob(job, QueueJobStatus.FAILED);
    }
  } catch (error) {
    // The job is already lease-expiring, so a failed FAILED-transition will be reclaimed later.
    // Log it rather than losing the only signal that the terminal transition itself failed.
    logger.error("queue_job_fail_transition_error", {
      jobId: job.id,
      orgId: job.orgId,
      errorType: error instanceof Error ? error.name : "unknown"
    });
  }
}

async function loadDispatchedQueueJob(claim: ScheduledCampaignQueueJobClaim): Promise<ClaimedQueueJob | null> {
  return withTenantTransaction({ orgId: claim.expectedOrgId }, async (tx) => {
    const job = await tx.queueJob.findFirst({
      where: {
        id: claim.queueJobId,
        orgId: claim.expectedOrgId,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING,
        processingToken: claim.processingToken
      }
    });
    if (
      !job ||
      job.orgId !== claim.expectedOrgId ||
      job.processingToken !== claim.processingToken ||
      !job.processingExpiresAt
    ) {
      return null;
    }
    return job as ClaimedQueueJob;
  });
}

async function processClaimedQueueJobSafely(job: ClaimedQueueJob, now = new Date()): Promise<SingleQueueJobProcessResult> {
  try {
    return await processClaimedScheduledCampaignQueueJob(job, now);
  } catch (error) {
    // Surface the underlying failure: this catch marks the job FAILED and pauses its campaign, and
    // without a log the operator has no signal (the metric is a no-op unless observability is on).
    logger.error("queue_job_processing_failed", {
      jobId: job.id,
      orgId: job.orgId,
      campaignId: job.campaignId ?? undefined,
      errorType: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error)
    });
    await failClaimedQueueJob(job);
    recordMetric(smsPipelineMetrics.queueThroughput, {
      action: "process",
      status: "failure",
      reason: "processing-failed",
      backend: "database"
    });
    return {
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "processing-failed"
    };
  }
}

export async function processDueScheduledCampaignJobs(
  now = new Date(),
  options: { maxJobsPerPoll?: number } = {}
) {
  const readiness = currentWorkerReadiness();
  if (!readiness.allowed) {
    return {
      processed: 0,
      skipped: 0,
      blocked: true,
      reason: readiness.reason
    };
  }

  const claims = await claimDueScheduledCampaignQueueJobs(
    now,
    options.maxJobsPerPoll ?? DEFAULT_WORKER_MAX_JOBS_PER_POLL
  );
  recordMetric(smsPipelineMetrics.queueDepth, { depth: claims.length, backend: "database" });

  let processed = 0;
  let skipped = 0;

  for (const claim of claims) {
    const job = await loadDispatchedQueueJob(claim);
    const result = job
      ? await processClaimedQueueJobSafely(job, now)
      : { processed: 0 as const, skipped: 1 as const, blocked: false, reason: "already-claimed" as const };
    processed += result.processed;
    skipped += result.skipped;
  }

  return {
    processed,
    skipped,
    blocked: false
  };
}

export async function processScheduledCampaignQueueJobById(
  reference: ScheduledCampaignQueueJobReference,
  now = new Date()
) {
  const readiness = currentWorkerReadiness();
  if (!readiness.allowed) {
    return { processed: 0, skipped: 0, blocked: true, reason: readiness.reason };
  }

  const claim = await claimScheduledCampaignQueueJob(reference, now);

  if (!claim.claimed) {
    return {
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: claim.reason
    } satisfies SingleQueueJobProcessResult;
  }

  return processClaimedQueueJobSafely(claim.job, now);
}

async function processClaimedScheduledCampaignQueueJob(job: ClaimedQueueJob, now = new Date()): Promise<SingleQueueJobProcessResult> {
  const killSwitch = checkCampaignWorkerKillSwitch(job.orgId);
  if (killSwitch.active) {
    await failClaimedQueueJob(job, { requireCampaignTransition: true });
    recordMetric(smsPipelineMetrics.queueThroughput, {
      action: "process",
      status: "failure",
      reason: "processing-failed",
      backend: "database"
    });
    return { processed: 0, skipped: 1, blocked: true, reason: "emergency-kill-switch-active" };
  }

  if (isWorkerShutdownRequested()) {
    return { processed: 0, skipped: 1, blocked: true, reason: "worker-shutdown-requested" };
  }

  recordWorkerHeartbeat(`worker-${process.pid}`, { status: "active", metadata: { orgId: job.orgId, jobId: job.id } });

  const payload = scheduledCampaignJobSchema.safeParse(job.payload);
  if (!payload.success || payload.data.orgId !== job.orgId || payload.data.campaignId !== job.campaignId) {
    await transitionClaimedQueueJob(job, QueueJobStatus.FAILED);
    recordMetric(smsPipelineMetrics.queueThroughput, { action: "process", status: "failure", reason: "invalid-payload", backend: "database" });
    return { processed: 0, skipped: 1, blocked: false, reason: "invalid-payload" };
  }

  const campaignData = await withTenantTransaction({ orgId: job.orgId }, async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { id: payload.data.campaignId, orgId: job.orgId },
      include: {
        recipients: {
          where: { orgId: job.orgId, contact: { orgId: job.orgId } },
          include: { contact: true }
        }
      }
    });
    const organization = typeof tx.organization?.findFirst === "function"
      ? await tx.organization.findFirst({
          where: { id: job.orgId },
          select: { timezone: true, demoMode: true }
        })
      : null;
    return { campaign, organization };
  });

  const campaign = campaignData.campaign;
  const orgTimeZone = campaignData.organization?.timezone ?? "America/Los_Angeles";

  if (!campaign || campaign.status !== CampaignStatus.SCHEDULED) {
    await transitionClaimedQueueJob(job, QueueJobStatus.FAILED);
    recordMetric(smsPipelineMetrics.queueThroughput, { action: "process", status: "failure", reason: "invalid-campaign", backend: "database" });
    return { processed: 0, skipped: 1, blocked: false, reason: "invalid-campaign" };
  }

  const activeScheduledAt = campaign.scheduledAt;
  if (!activeScheduledAt || activeScheduledAt.toISOString() !== payload.data.scheduledAt) {
    await transitionClaimedQueueJob(job, QueueJobStatus.CANCELLED);
    recordMetric(smsPipelineMetrics.queueThroughput, { action: "process", status: "cancelled", reason: "stale-schedule", backend: "database" });
    return { processed: 0, skipped: 1, blocked: false, reason: "stale-schedule" };
  }

  const recipientContacts = campaign.recipients.map((recipient) => recipient.contact);
  const sendPreflight = preflightCampaignRecipients(recipientContacts, undefined, {
    now,
    timeZone: orgTimeZone,
    checkQuietHours: true
  });
  const preflightByContactId = new Map(
    sendPreflight.recipients.map((recipient) => [recipient.contactId, recipient])
  );
  const sendableRecipients = campaign.recipients.filter((recipient) =>
    preflightByContactId.get(recipient.contactId)?.allowed
  );
  const blockedRecipients = campaign.recipients
    .map((recipient) => ({ recipient, preflight: preflightByContactId.get(recipient.contactId) }))
    .filter(({ preflight }) => !preflight?.allowed);

  const blockedRecipientsByReason = new Map<string, string[]>();
  for (const { recipient, preflight } of blockedRecipients) {
    const reason = preflight?.reasons.join(",") || "SEND_TIME_PREFLIGHT_BLOCKED";
    if (!blockedRecipientsByReason.has(reason)) {
      blockedRecipientsByReason.set(reason, []);
    }
    blockedRecipientsByReason.get(reason)!.push(recipient.id);
  }

  await withTenantTransaction({ orgId: job.orgId }, async (tx) => {
    if (sendableRecipients.length > 0) {
      await tx.campaignRecipient.updateMany({
        where: { orgId: job.orgId, id: { in: sendableRecipients.map((recipient) => recipient.id) } },
        data: { status: CampaignRecipientStatus.PENDING, blockReason: null }
      });
    }

    for (const [reason, recipientIds] of blockedRecipientsByReason) {
      await tx.campaignRecipient.updateMany({
        where: { orgId: job.orgId, id: { in: recipientIds } },
        data: {
          status: CampaignRecipientStatus.BLOCKED,
          blockReason: reason
        }
      });
    }
  });

  if (sendableRecipients.length === 0) {
    await failClaimedQueueJob(job, { requireCampaignTransition: true });
    recordMetric(smsPipelineMetrics.queueThroughput, { action: "process", status: "failure", reason: "send-preflight-failed", backend: "database" });
    return { processed: 0, skipped: 1, blocked: false, reason: "send-preflight-failed" };
  }

  for (const recipient of sendableRecipients) {
    await renewClaimedQueueJob(job);

    const midFlightKillSwitch = checkCampaignWorkerKillSwitch(job.orgId);
    if (midFlightKillSwitch.active) {
      await failClaimedQueueJob(job, { requireCampaignTransition: true });
      return { processed: 0, skipped: 1, blocked: true, reason: "emergency-kill-switch-active" };
    }

    const rateLimit = checkProviderRateLimit(job.orgId);
    if (!rateLimit.allowed && rateLimit.retryAfterMs) {
      await sleep(rateLimit.retryAfterMs);
    }

    // Fresh DB Re-Check for Mid-Flight Opt-Out / Consent
    const freshContact = await withTenantTransaction({ orgId: job.orgId }, async (tx) => {
      if (typeof tx.contact?.findFirst === "function") {
        return (
          (await tx.contact.findFirst({
            where: { id: recipient.contactId, orgId: job.orgId },
            select: {
              id: true,
              phone: true,
              email: true,
              firstName: true,
              lastName: true,
              displayName: true,
              consentStatus: true,
              optedOutAt: true,
              archivedAt: true
            }
          })) ?? recipient.contact
        );
      }
      return recipient.contact;
    });

    if (!freshContact) {
      await withTenantTransaction({ orgId: job.orgId }, (tx) =>
        tx.campaignRecipient.updateMany({
          where: { orgId: job.orgId, id: recipient.id },
          data: { status: CampaignRecipientStatus.BLOCKED, blockReason: "CONTACT_NOT_FOUND" }
        })
      );
      continue;
    }

    // Re-check consent and quiet hours immediately before each message attempt enqueue
    const immediatePreflight = preflightCampaignRecipients([freshContact], undefined, {
      now,
      timeZone: orgTimeZone,
      checkQuietHours: true
    });
    if (!immediatePreflight.allowed) {
      const reason = immediatePreflight.recipients[0]?.reasons.join(",") || "SEND_TIME_PREFLIGHT_BLOCKED";
      await withTenantTransaction({ orgId: job.orgId }, (tx) =>
        tx.campaignRecipient.updateMany({
          where: { orgId: job.orgId, id: recipient.id },
          data: { status: CampaignRecipientStatus.BLOCKED, blockReason: reason }
        })
      );
      continue;
    }

    const idempotencyKey = outboundCampaignMessageIdempotencyKey(job.orgId, job.id, recipient.contactId);
    const body = renderTemplate(campaign.body, campaignMessageValues(freshContact));
    const correlationId = randomUUID();

    // Durable-Before-External Outbox Transaction Ordering:
    // Create Message and MessageAttempt in PostgreSQL BEFORE making external provider call
    let msgRecord: { id: string } | null = null;
    let attemptRecord: { id: string } | null = null;

    await withTenantTransaction({ orgId: job.orgId }, async (tx) => {
      if (typeof tx.message?.upsert === "function") {
        msgRecord = await tx.message.upsert({
          where: { orgId_idempotencyKey: { orgId: job.orgId, idempotencyKey } },
          update: {},
          create: {
            orgId: job.orgId,
            contactId: freshContact.id,
            campaignId: campaign.id,
            direction: "OUTBOUND",
            body,
            applicationStatus: MessageApplicationStatus.PROCESSING,
            transport: MessageTransport.DUMMY,
            destination: freshContact.phone,
            idempotencyKey
          }
        });
      }

      if (msgRecord && typeof tx.messageAttempt?.create === "function") {
        const existingAttempt = typeof tx.messageAttempt?.findFirst === "function"
          ? await tx.messageAttempt.findFirst({
              where: { orgId: job.orgId, messageId: msgRecord.id, attemptNumber: 1 }
            })
          : null;
        if (existingAttempt) {
          attemptRecord = existingAttempt;
        } else {
          attemptRecord = await tx.messageAttempt.create({
            data: {
              orgId: job.orgId,
              messageId: msgRecord.id,
              attemptNumber: 1,
              status: MessageAttemptStatus.PROCESSING,
              transport: MessageTransport.DUMMY,
              dueAt: new Date(),
              destination: freshContact.phone,
              body,
              requestFingerprint: idempotencyKey,
              callbackCorrelationId: correlationId
            }
          });
        }
      }
    });

    let providerResult;
    try {
      providerResult = await dummyProvider.send({
        to: freshContact.phone,
        from: "demo-signalstack",
        body,
        orgId: job.orgId,
        idempotencyKey
      });
    } catch (err) {
      await withTenantTransaction({ orgId: job.orgId }, async (tx) => {
        if (msgRecord && typeof tx.message?.update === "function") {
          await tx.message.update({
            where: { id: msgRecord.id },
            data: {
              applicationStatus: MessageApplicationStatus.FAILED,
              failedAt: new Date()
            }
          });
        }
        if (attemptRecord && typeof tx.messageAttempt?.update === "function") {
          await tx.messageAttempt.update({
            where: { id: attemptRecord.id },
            data: {
              status: MessageAttemptStatus.FAILED,
              completedAt: new Date(),
              errorCode: err instanceof Error ? err.name : "PROVIDER_ERROR",
              disposition: "failed"
            }
          });
        }
      });
      throw err;
    }

    await withTenantTransaction({ orgId: job.orgId }, async (tx) => {
      if (msgRecord && typeof tx.message?.update === "function") {
        await tx.message.update({
          where: { id: msgRecord.id },
          data: {
            applicationStatus: MessageApplicationStatus.SENT,
            providerMessageId: providerResult.providerMessageId,
            providerStatus: providerResult.status,
            sentAt: new Date()
          }
        });
      }

      if (attemptRecord && typeof tx.messageAttempt?.update === "function") {
        await tx.messageAttempt.update({
          where: { id: attemptRecord.id },
          data: {
            status: MessageAttemptStatus.SUCCEEDED,
            providerMessageId: providerResult.providerMessageId,
            providerStatus: providerResult.status,
            completedAt: new Date(),
            disposition: "success"
          }
        });
      }
    });
  }

  await transitionClaimedQueueJobWithCampaign(job, {
    queueStatus: QueueJobStatus.COMPLETED,
    campaignId: campaign.id,
    campaignStatus: CampaignStatus.COMPLETED,
    scheduledAt: activeScheduledAt,
    requireCampaignTransition: true
  });
  recordMetric(smsPipelineMetrics.queueThroughput, { action: "process", status: "success", backend: "database" });
  return { processed: 1, skipped: 0, blocked: false };
}

// The continuous worker runs indefinitely, so its returned history is a bounded ring buffer: retaining
// every poll result would leak memory in a long-lived `worker:watch` process. Per-iteration results are
// still delivered live via `onResult`; the returned array holds only the most recent window.
const CONTINUOUS_WORKER_RESULT_HISTORY_LIMIT = 1_000;

export async function runContinuousScheduledCampaignWorker(input: ContinuousWorkerInput) {
  const results: WorkerRunResult[] = [];
  let iteration = 0;

  while (input.shouldContinue?.() ?? true) {
    iteration += 1;
    const result = await processDueScheduledCampaignJobs(new Date(), { maxJobsPerPoll: input.maxJobsPerPoll });
    results.push(result);
    if (results.length > CONTINUOUS_WORKER_RESULT_HISTORY_LIMIT) {
      results.shift();
    }
    input.onResult?.(result, iteration);

    if (result.blocked || (input.maxIterations && iteration >= input.maxIterations)) {
      break;
    }

    await sleep(input.pollIntervalMs);
  }

  return results;
}
