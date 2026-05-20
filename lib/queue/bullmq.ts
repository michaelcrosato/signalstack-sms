import { Queue, type JobsOptions } from "bullmq";
import type { QueueJob } from "@prisma/client";
import { getRedisQueueConfig, redisConnectionFromUrl } from "@/lib/queue/redis";
import { scheduledCampaignJobSchema, type ScheduledCampaignJob } from "@/lib/queue/jobs";

export const scheduledCampaignBullMqQueueName = "signalstack-scheduled-campaigns";
export const scheduledCampaignBullMqJobName = "scheduled-campaign";

export type QueueBackend = "database" | "bullmq";

export type BullMqEnqueueResult =
  | { enqueued: true; queueName: string; jobName: string; jobId: string; delayMs: number }
  | { enqueued: false; reason: "backend-disabled" | "missing-redis-url" | "invalid-payload" | "enqueue-failed"; error?: string };

export function getQueueBackend(env: Record<string, string | undefined> = process.env): QueueBackend {
  return env.QUEUE_BACKEND === "bullmq" ? "bullmq" : "database";
}

export function buildScheduledCampaignBullMqJob(input: {
  queueJobId: string;
  idempotencyKey: string;
  payload: ScheduledCampaignJob;
  runAt: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const delayMs = Math.max(input.runAt.getTime() - now.getTime(), 0);

  return {
    name: scheduledCampaignBullMqJobName,
    data: {
      queueJobId: input.queueJobId,
      ...input.payload
    },
    options: {
      jobId: input.idempotencyKey,
      delay: delayMs,
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false
    } satisfies JobsOptions,
    delayMs
  };
}

export async function enqueueScheduledCampaignBullMqJob(
  queueJob: Pick<QueueJob, "id" | "idempotencyKey" | "payload" | "runAt">,
  input: { env?: Record<string, string | undefined>; now?: Date } = {}
): Promise<BullMqEnqueueResult> {
  const env = input.env ?? process.env;
  if (getQueueBackend(env) !== "bullmq") {
    return { enqueued: false, reason: "backend-disabled" };
  }

  const { redisUrl } = getRedisQueueConfig(env);
  if (!redisUrl) {
    return { enqueued: false, reason: "missing-redis-url" };
  }

  const payload = scheduledCampaignJobSchema.safeParse(queueJob.payload);
  if (!payload.success) {
    return { enqueued: false, reason: "invalid-payload", error: payload.error.message };
  }

  const job = buildScheduledCampaignBullMqJob({
    queueJobId: queueJob.id,
    idempotencyKey: queueJob.idempotencyKey,
    payload: payload.data,
    runAt: queueJob.runAt,
    now: input.now
  });
  const queue = new Queue(scheduledCampaignBullMqQueueName, {
    connection: redisConnectionFromUrl(redisUrl)
  });

  try {
    await queue.add(job.name, job.data, job.options);
    return {
      enqueued: true,
      queueName: scheduledCampaignBullMqQueueName,
      jobName: job.name,
      jobId: queueJob.idempotencyKey,
      delayMs: job.delayMs
    };
  } catch (error) {
    return {
      enqueued: false,
      reason: "enqueue-failed",
      error: error instanceof Error ? error.message : "Unknown BullMQ enqueue failure."
    };
  } finally {
    await queue.close();
  }
}
