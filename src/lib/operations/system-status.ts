import { getQueueBackend } from "@/lib/queue/bullmq";
import { getApiRateLimitPolicy } from "@/lib/rate-limit/api-rate-limit";

export type SystemSafetyStatus = {
  demoMode: boolean;
  liveMessagingEnabled: boolean;
  liveBillingEnabled: boolean;
  messagingProvider: string;
  aiProvider: string;
  externalImpactBlocked: boolean;
};

export type SystemQueueStatus = {
  backend: "database" | "bullmq";
  redisConfigured: boolean;
  workerMaxJobsPerPoll: number;
};

export type SystemDeploymentStatus = {
  nodeEnv: string;
  vercelEnv: string;
  appEnv: string;
  productionExternalOverride: boolean;
};

export type SystemStatus = {
  safety: SystemSafetyStatus;
  queue: SystemQueueStatus;
  deployment: SystemDeploymentStatus;
  apiRateLimit: {
    enabled: boolean;
    limit: number;
    windowSeconds: number;
  };
};

export function getSystemStatus(env: Record<string, string | undefined> = process.env): SystemStatus {
  const rateLimit = getApiRateLimitPolicy(env);
  const liveMessagingEnabled = env.LIVE_MESSAGING_ENABLED === "true";
  const liveBillingEnabled = env.LIVE_BILLING_ENABLED === "true";

  return {
    safety: {
      demoMode: env.DEMO_MODE !== "false",
      liveMessagingEnabled,
      liveBillingEnabled,
      messagingProvider: env.MESSAGING_PROVIDER ?? "dummy",
      aiProvider: env.AI_PROVIDER ?? "fake",
      externalImpactBlocked:
        !liveMessagingEnabled &&
        !liveBillingEnabled &&
        (env.MESSAGING_PROVIDER ?? "dummy") === "dummy" &&
        (env.AI_PROVIDER ?? "fake") === "fake"
    },
    queue: {
      backend: getQueueBackend(env),
      redisConfigured: Boolean(env.REDIS_URL),
      workerMaxJobsPerPoll: parseBoundedInteger(env.WORKER_MAX_JOBS_PER_POLL, 10, 1, 100)
    },
    deployment: {
      nodeEnv: env.NODE_ENV ?? "development",
      vercelEnv: env.VERCEL_ENV ?? "local",
      appEnv: env.APP_ENV ?? "local",
      productionExternalOverride: env.ALLOW_PRODUCTION_EXTERNALS === "true"
    },
    apiRateLimit: {
      enabled: rateLimit.enabled,
      limit: rateLimit.limit,
      windowSeconds: rateLimit.windowMs / 1000
    }
  };
}

function parseBoundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}
