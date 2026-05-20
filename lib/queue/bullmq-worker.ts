import { Worker } from "bullmq";
import { scheduledCampaignBullMqQueueName } from "@/lib/queue/bullmq";
import { scheduledCampaignBullMqJobDataSchema } from "@/lib/queue/jobs";
import { getRedisQueueConfig, redisConnectionFromUrl } from "@/lib/queue/redis";
import { localWorkerProviderIsAllowed, processScheduledCampaignQueueJobById } from "@/lib/queue/worker";

export type BullMqWorkerStartResult =
  | { started: true; worker: Worker }
  | {
      started: false;
      reason: "backend-disabled" | "missing-redis-url" | "provider-blocked";
    };

export function bullMqWorkerCanStart(env: Record<string, string | undefined> = process.env) {
  if (env.QUEUE_BACKEND !== "bullmq") {
    return { allowed: false, reason: "backend-disabled" } as const;
  }
  if (!env.REDIS_URL) {
    return { allowed: false, reason: "missing-redis-url" } as const;
  }
  if (
    !localWorkerProviderIsAllowed({
      liveMessagingEnabled: env.LIVE_MESSAGING_ENABLED,
      messagingProvider: env.MESSAGING_PROVIDER
    })
  ) {
    return { allowed: false, reason: "provider-blocked" } as const;
  }

  return { allowed: true } as const;
}

export function createScheduledCampaignBullMqWorker(env: Record<string, string | undefined> = process.env) {
  const { redisUrl } = getRedisQueueConfig(env);
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for BullMQ worker startup.");
  }

  return new Worker(
    scheduledCampaignBullMqQueueName,
    async (job) => {
      const payload = scheduledCampaignBullMqJobDataSchema.parse(job.data);
      return processScheduledCampaignQueueJobById(payload.queueJobId);
    },
    {
      connection: redisConnectionFromUrl(redisUrl),
      concurrency: 1
    }
  );
}

export function startScheduledCampaignBullMqWorker(
  env: Record<string, string | undefined> = process.env
): BullMqWorkerStartResult {
  const readiness = bullMqWorkerCanStart(env);
  if (!readiness.allowed) {
    return { started: false, reason: readiness.reason };
  }

  return { started: true, worker: createScheduledCampaignBullMqWorker(env) };
}
