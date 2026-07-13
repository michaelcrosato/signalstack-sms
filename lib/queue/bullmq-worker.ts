import { Worker } from "bullmq";
import { scheduledCampaignBullMqQueueName } from "@/lib/queue/bullmq";
import { scheduledCampaignBullMqJobDataSchema } from "@/lib/queue/jobs";
import { getRedisQueueConfig, redisConnectionFromUrl } from "@/lib/queue/redis";
import { positiveIntFromEnv } from "@/lib/queue/parse-env";
import { localWorkerReadiness, processScheduledCampaignQueueJobById } from "@/lib/queue/worker";
import { logger } from "@/lib/observability/logger";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";

const terminalBullMqQueueJobReasons = new Set([
  "missing-job",
  "org-mismatch",
  "invalid-payload",
  "invalid-campaign",
  "stale-schedule",
  "send-preflight-failed"
]);

export type BullMqWorkerStartResult =
  | { started: true; worker: Worker }
  | {
      started: false;
      reason: "backend-disabled" | "missing-redis-url" | "provider-blocked" | "production-worker-blocked";
    };

export function bullMqWorkerCanStart(env: Record<string, string | undefined> = process.env) {
  if (env.QUEUE_BACKEND !== "bullmq") {
    return { allowed: false, reason: "backend-disabled" } as const;
  }
  if (!env.REDIS_URL) {
    return { allowed: false, reason: "missing-redis-url" } as const;
  }
  const readiness = localWorkerReadiness({
    liveMessagingEnabled: env.LIVE_MESSAGING_ENABLED,
    messagingProvider: env.MESSAGING_PROVIDER,
    workerDeploymentClass: env.WORKER_DEPLOYMENT_CLASS,
    nodeEnv: env.NODE_ENV,
    vercelEnv: env.VERCEL_ENV,
    deploymentEnv: env.DEPLOYMENT_ENV,
    appEnv: env.APP_ENV
  });
  if (!readiness.allowed) {
    return { allowed: false, reason: readiness.reason } as const;
  }

  return { allowed: true } as const;
}

export function createScheduledCampaignBullMqWorker(env: Record<string, string | undefined> = process.env) {
  const readiness = bullMqWorkerCanStart(env);
  if (!readiness.allowed) {
    throw new Error(`BullMQ worker startup blocked: ${readiness.reason}.`);
  }

  const { redisUrl } = getRedisQueueConfig(env);
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for BullMQ worker startup.");
  }

  const lockDuration = positiveIntFromEnv(env.BULLMQ_LOCK_DURATION_MS, 30000); // 30 seconds
  const stalledInterval = positiveIntFromEnv(env.BULLMQ_STALLED_INTERVAL_MS, 30000); // 30 seconds

  const worker = new Worker(
    scheduledCampaignBullMqQueueName,
    async (job) => {
      const payload = scheduledCampaignBullMqJobDataSchema.parse(job.data);
      const result = await processScheduledCampaignQueueJobById({
        queueJobId: payload.queueJobId,
        expectedOrgId: payload.orgId
      });
      if (result.processed === 1 || (result.reason && terminalBullMqQueueJobReasons.has(result.reason))) {
        return result;
      }

      // BullMQ may acknowledge only a completed or durably terminal database
      // outcome. Recoverable states must consume an attempt and follow the
      // configured backoff instead of disappearing from the mirror queue.
      throw new Error("Durable queue job has not reached a terminal state.");
    },
    {
      connection: redisConnectionFromUrl(redisUrl),
      concurrency: 1,
      lockDuration,
      stalledInterval
    }
  );

  // Monitor worker error and fail events
  worker.on("failed", (job, err) => {
    logger.error("bullmq_worker_job_failed", {
      jobId: job?.id || "[unknown]",
      jobName: job?.name || "[unknown]",
      errorType: err.name
    });
    recordMetric(smsPipelineMetrics.queueThroughput, {
      action: "job_failed",
      status: "failure",
      jobId: job?.id,
      backend: "bullmq"
    });
  });

  worker.on("error", (err) => {
    logger.error("bullmq_worker_error", {
      errorType: err.name
    });
  });

  return worker;
}

let signalHandlersRegistered = false;
const activeWorkers = new Set<Worker>();

export function registerGracefulShutdown(worker: Worker) {
  activeWorkers.add(worker);

  if (signalHandlersRegistered) {
    return;
  }
  signalHandlersRegistered = true;

  const handleShutdown = async (signal: string) => {
    logger.info("graceful_shutdown_initiated", { signal });
    const closePromises = Array.from(activeWorkers).map(async (w) => {
      try {
        await w.close();
        logger.info("bullmq_worker_closed_gracefully");
      } catch (err) {
        logger.error("bullmq_worker_close_failed", {
          errorType: err instanceof Error ? err.name : "UnknownError"
        });
      }
    });

    await Promise.all(closePromises);
    activeWorkers.clear();
  };

  process.once("SIGTERM", () => handleShutdown("SIGTERM"));
  process.once("SIGINT", () => handleShutdown("SIGINT"));
}

export function startScheduledCampaignBullMqWorker(
  env: Record<string, string | undefined> = process.env
): BullMqWorkerStartResult {
  const readiness = bullMqWorkerCanStart(env);
  if (!readiness.allowed) {
    return { started: false, reason: readiness.reason };
  }

  const worker = createScheduledCampaignBullMqWorker(env);
  registerGracefulShutdown(worker);

  return { started: true, worker };
}

