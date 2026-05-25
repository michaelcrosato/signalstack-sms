import { describe, expect, it } from "vitest";
import { bullMqWorkerCanStart, createScheduledCampaignBullMqWorker } from "@/lib/queue/bullmq-worker";
import { scheduledCampaignBullMqJobDataSchema } from "@/lib/queue/jobs";

describe("BullMQ worker foundation", () => {
  const productionLikeRuntimeMarkers = [
    { NODE_ENV: "production" },
    { VERCEL_ENV: "production" },
    { DEPLOYMENT_ENV: "prod" },
    { APP_ENV: "prod" }
  ];

  it("blocks worker startup unless BullMQ, Redis, and dummy-only safety gates are configured", () => {
    expect(bullMqWorkerCanStart({})).toEqual({ allowed: false, reason: "backend-disabled" });
    expect(bullMqWorkerCanStart({ QUEUE_BACKEND: "bullmq" })).toEqual({
      allowed: false,
      reason: "missing-redis-url"
    });
    expect(
      bullMqWorkerCanStart({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        NODE_ENV: "production",
        LIVE_MESSAGING_ENABLED: "false",
        MESSAGING_PROVIDER: "dummy"
      })
    ).toEqual({ allowed: false, reason: "production-worker-blocked" });
    expect(
      bullMqWorkerCanStart({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        WORKER_DEPLOYMENT_CLASS: "production-live",
        LIVE_MESSAGING_ENABLED: "false",
        MESSAGING_PROVIDER: "dummy"
      })
    ).toEqual({ allowed: false, reason: "production-worker-blocked" });
    expect(
      bullMqWorkerCanStart({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        WORKER_DEPLOYMENT_CLASS: "production-live-campaign",
        LIVE_MESSAGING_ENABLED: "false",
        MESSAGING_PROVIDER: "dummy"
      })
    ).toEqual({ allowed: false, reason: "production-worker-blocked" });
    expect(
      bullMqWorkerCanStart({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        WORKER_DEPLOYMENT_CLASS: "local-demo",
        LIVE_MESSAGING_ENABLED: "true",
        MESSAGING_PROVIDER: "dummy"
      })
    ).toEqual({ allowed: false, reason: "provider-blocked" });
    expect(
      bullMqWorkerCanStart({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        LIVE_MESSAGING_ENABLED: "false",
        MESSAGING_PROVIDER: "twilio"
      })
    ).toEqual({ allowed: false, reason: "provider-blocked" });
    expect(
      bullMqWorkerCanStart({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        LIVE_MESSAGING_ENABLED: "false",
        MESSAGING_PROVIDER: "dummy"
      })
    ).toEqual({ allowed: true });
  });

  it("blocks every production-like runtime marker before provider checks", () => {
    for (const marker of productionLikeRuntimeMarkers) {
      expect(
        bullMqWorkerCanStart({
          QUEUE_BACKEND: "bullmq",
          REDIS_URL: "redis://localhost:6379",
          ...marker,
          LIVE_MESSAGING_ENABLED: "true",
          MESSAGING_PROVIDER: "twilio",
          WORKER_DEPLOYMENT_CLASS: "production-live-campaign"
        })
      ).toEqual({ allowed: false, reason: "production-worker-blocked" });
    }
  });

  it("blocks direct BullMQ worker creation through the same startup gate", () => {
    expect(() => createScheduledCampaignBullMqWorker({})).toThrow(
      "BullMQ worker startup blocked: backend-disabled."
    );
    expect(() =>
      createScheduledCampaignBullMqWorker({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        NODE_ENV: "production",
        LIVE_MESSAGING_ENABLED: "false",
        MESSAGING_PROVIDER: "dummy"
      })
    ).toThrow("BullMQ worker startup blocked: production-worker-blocked.");
    expect(() =>
      createScheduledCampaignBullMqWorker({
        QUEUE_BACKEND: "bullmq",
        REDIS_URL: "redis://localhost:6379",
        LIVE_MESSAGING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio"
      })
    ).toThrow("BullMQ worker startup blocked: provider-blocked.");
  });

  it("validates BullMQ worker payloads with durable queue job IDs", () => {
    expect(
      scheduledCampaignBullMqJobDataSchema.parse({
        queueJobId: "queue_job_demo",
        version: 1,
        orgId: "org_demo",
        campaignId: "campaign_demo",
        scheduledAt: "2026-05-20T12:00:00.000Z"
      })
    ).toMatchObject({
      queueJobId: "queue_job_demo",
      version: 1
    });
    expect(() =>
      scheduledCampaignBullMqJobDataSchema.parse({
        version: 1,
        orgId: "org_demo",
        campaignId: "campaign_demo",
        scheduledAt: "2026-05-20T12:00:00.000Z"
      })
    ).toThrow();
  });
});
