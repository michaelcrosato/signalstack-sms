import { describe, expect, it } from "vitest";
import { getSystemStatus } from "@/lib/operations/system-status";

describe("getSystemStatus", () => {
  it("reports demo-safe defaults as externally blocked", () => {
    const status = getSystemStatus({});

    expect(status.safety).toMatchObject({
      demoMode: true,
      liveMessagingEnabled: false,
      liveBillingEnabled: false,
      messagingProvider: "dummy",
      aiProvider: "fake",
      externalImpactBlocked: true
    });
    expect(status.queue).toMatchObject({
      backend: "database",
      redisConfigured: false,
      workerMaxJobsPerPoll: 10
    });
    expect(status.apiRateLimit).toMatchObject({
      enabled: true,
      limit: 120,
      windowSeconds: 60
    });
  });

  it("surfaces review state when live-impact flags are present", () => {
    const status = getSystemStatus({
      DEMO_MODE: "false",
      LIVE_MESSAGING_ENABLED: "true",
      LIVE_BILLING_ENABLED: "true",
      MESSAGING_PROVIDER: "twilio",
      AI_PROVIDER: "live",
      QUEUE_BACKEND: "bullmq",
      REDIS_URL: "redis://localhost:6379",
      WORKER_MAX_JOBS_PER_POLL: "500",
      API_RATE_LIMIT_MAX: "25",
      API_RATE_LIMIT_WINDOW_MS: "5000",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      APP_ENV: "prod",
      ALLOW_PRODUCTION_EXTERNALS: "true"
    });

    expect(status.safety.externalImpactBlocked).toBe(false);
    expect(status.queue).toMatchObject({
      backend: "bullmq",
      redisConfigured: true,
      workerMaxJobsPerPoll: 100
    });
    expect(status.deployment).toMatchObject({
      nodeEnv: "production",
      vercelEnv: "production",
      appEnv: "prod",
      productionExternalOverride: true
    });
    expect(status.apiRateLimit).toMatchObject({
      enabled: true,
      limit: 25,
      windowSeconds: 5
    });
  });
});
