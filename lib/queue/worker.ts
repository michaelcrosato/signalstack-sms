import { setTimeout as sleep } from "node:timers/promises";
import { CampaignStatus, QueueJobStatus, QueueJobType, type Contact, type QueueJob } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { environmentIsProductionLike } from "@/lib/deployment/production-gate";
import { dummyProvider } from "@/lib/messaging/provider/dummy-provider";
import { renderTemplate } from "@/lib/messaging/render-template";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";

export type WorkerSafetyInput = {
  liveMessagingEnabled?: string;
  messagingProvider?: string;
  workerDeploymentClass?: string;
  nodeEnv?: string;
  vercelEnv?: string;
  deploymentEnv?: string;
  appEnv?: string;
};

export type WorkerMode = "once" | "continuous";

export type WorkerRuntimeOptions = {
  mode: WorkerMode;
  pollIntervalMs: number;
  maxJobsPerPoll: number;
  maxIterations?: number;
};

export type WorkerRunResult = Awaited<ReturnType<typeof processDueScheduledCampaignJobs>>;

export type SingleQueueJobProcessResult = {
  processed: 0 | 1;
  skipped: 0 | 1;
  blocked: boolean;
  reason?:
    | "provider-blocked"
    | "production-worker-blocked"
    | "missing-job"
    | "not-due"
    | "invalid-payload"
    | "invalid-campaign"
    | "send-preflight-failed";
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

export function localWorkerProviderIsAllowed(input: WorkerSafetyInput) {
  return input.liveMessagingEnabled !== "true" && (input.messagingProvider ?? "dummy") === "dummy";
}

export function workerDeploymentClassIsAllowed(input: WorkerSafetyInput) {
  return !input.workerDeploymentClass || supportedWorkerDeploymentClasses.includes(input.workerDeploymentClass as "local-demo");
}

export function localWorkerReadiness(input: WorkerSafetyInput): WorkerReadinessResult {
  if (
    environmentIsProductionLike({
      NODE_ENV: input.nodeEnv,
      VERCEL_ENV: input.vercelEnv,
      DEPLOYMENT_ENV: input.deploymentEnv,
      APP_ENV: input.appEnv
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
  return preflightCampaignRecipients(contacts).allowed;
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

  const jobs = await prisma.queueJob.findMany({
    where: {
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: QueueJobStatus.QUEUED,
      runAt: { lte: now }
    },
    orderBy: { runAt: "asc" },
    take: options.maxJobsPerPoll ?? DEFAULT_WORKER_MAX_JOBS_PER_POLL
  });

  let processed = 0;
  let skipped = 0;

  for (const job of jobs) {
    const result = await processScheduledCampaignQueueJob(job, now);
    processed += result.processed;
    skipped += result.skipped;
  }

  return {
    processed,
    skipped,
    blocked: false
  };
}

export async function processScheduledCampaignQueueJobById(queueJobId: string, now = new Date()) {
  const job = await prisma.queueJob.findFirst({
    where: {
      id: queueJobId,
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: QueueJobStatus.QUEUED
    }
  });

  if (!job) {
    return {
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "missing-job"
    } satisfies SingleQueueJobProcessResult;
  }

  return processScheduledCampaignQueueJob(job, now);
}

async function processScheduledCampaignQueueJob(
  job: QueueJob,
  now = new Date()
): Promise<SingleQueueJobProcessResult> {
  const readiness = currentWorkerReadiness();
  if (!readiness.allowed) {
    return { processed: 0, skipped: 0, blocked: true, reason: readiness.reason };
  }

  if (job.runAt.getTime() > now.getTime()) {
    return { processed: 0, skipped: 1, blocked: false, reason: "not-due" };
  }

  const payload = scheduledCampaignJobSchema.safeParse(job.payload);
  if (!payload.success || payload.data.orgId !== job.orgId || payload.data.campaignId !== job.campaignId) {
    await prisma.queueJob.update({ where: { id: job.id }, data: { status: QueueJobStatus.FAILED } });
    return { processed: 0, skipped: 1, blocked: false, reason: "invalid-payload" };
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: payload.data.campaignId, orgId: job.orgId },
    include: { recipients: { include: { contact: true } } }
  });
  if (!campaign || campaign.status !== CampaignStatus.SCHEDULED) {
    await prisma.queueJob.update({ where: { id: job.id }, data: { status: QueueJobStatus.FAILED } });
    return { processed: 0, skipped: 1, blocked: false, reason: "invalid-campaign" };
  }

  const recipientContacts = campaign.recipients.map((recipient) => recipient.contact);
  if (!scheduledCampaignSendIsAllowed(recipientContacts)) {
    await prisma.queueJob.update({ where: { id: job.id }, data: { status: QueueJobStatus.FAILED } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.PAUSED } });
    return { processed: 0, skipped: 1, blocked: false, reason: "send-preflight-failed" };
  }

  for (const recipient of campaign.recipients) {
    const idempotencyKey = `dummy-outbound:${job.id}:${recipient.contactId}`;
    const body = renderTemplate(campaign.body, campaignMessageValues(recipient.contact));
    const result = await dummyProvider.send({
      to: recipient.contact.phone,
      from: "demo-signalstack",
      body,
      orgId: job.orgId,
      idempotencyKey
    });

    await prisma.message.upsert({
      where: { orgId_idempotencyKey: { orgId: job.orgId, idempotencyKey } },
      update: {},
      create: {
        orgId: job.orgId,
        contactId: recipient.contactId,
        campaignId: campaign.id,
        direction: "OUTBOUND",
        body,
        providerMessageId: result.providerMessageId,
        idempotencyKey
      }
    });
  }

  await prisma.queueJob.update({ where: { id: job.id }, data: { status: QueueJobStatus.COMPLETED } });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.COMPLETED } });
  return { processed: 1, skipped: 0, blocked: false };
}

export async function runContinuousScheduledCampaignWorker(input: ContinuousWorkerInput) {
  const results: WorkerRunResult[] = [];
  let iteration = 0;

  while (input.shouldContinue?.() ?? true) {
    iteration += 1;
    const result = await processDueScheduledCampaignJobs(new Date(), { maxJobsPerPoll: input.maxJobsPerPoll });
    results.push(result);
    input.onResult?.(result, iteration);

    if (result.blocked || (input.maxIterations && iteration >= input.maxIterations)) {
      break;
    }

    await sleep(input.pollIntervalMs);
  }

  return results;
}
