import { describe, expect, it } from "vitest";
import {
  buildScheduledCampaignBullMqJob,
  enqueueScheduledCampaignBullMqJob,
  getQueueBackend,
  scheduledCampaignBullMqJobName,
  scheduledCampaignBullMqQueueName
} from "@/lib/queue/bullmq";
import { redisConnectionFromUrl } from "@/lib/queue/redis";

const payload = {
  version: 1 as const,
  orgId: "org_demo",
  campaignId: "campaign_demo",
  scheduledAt: "2026-05-20T12:00:00.000Z"
};

describe("BullMQ queue foundation", () => {
  it("keeps database queue backend as the default", () => {
    expect(getQueueBackend({})).toBe("database");
    expect(getQueueBackend({ QUEUE_BACKEND: "database" })).toBe("database");
    expect(getQueueBackend({ QUEUE_BACKEND: "bullmq" })).toBe("bullmq");
    expect(getQueueBackend({ QUEUE_BACKEND: "redis" })).toBe("database");
  });

  it("builds deterministic scheduled campaign BullMQ jobs", () => {
    const job = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
      payload,
      runAt: new Date("2026-05-20T12:00:10.000Z"),
      now: new Date("2026-05-20T12:00:00.000Z")
    });

    expect(job).toEqual({
      name: scheduledCampaignBullMqJobName,
      data: {
        queueJobId: "queue_job_demo",
        ...payload
      },
      options: {
        jobId: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
        delay: 10000,
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false
      },
      delayMs: 10000
    });
    expect(scheduledCampaignBullMqQueueName).toBe("signalstack-scheduled-campaigns");
  });

  it("no-ops safely unless BullMQ and Redis are explicitly configured", async () => {
    await expect(
      enqueueScheduledCampaignBullMqJob({
        id: "queue_job_demo",
        idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
        payload,
        runAt: new Date("2026-05-20T12:00:00.000Z")
      })
    ).resolves.toEqual({ enqueued: false, reason: "backend-disabled" });

    await expect(
      enqueueScheduledCampaignBullMqJob(
        {
          id: "queue_job_demo",
          idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
          payload,
          runAt: new Date("2026-05-20T12:00:00.000Z")
        },
        { env: { QUEUE_BACKEND: "bullmq" } }
      )
    ).resolves.toEqual({ enqueued: false, reason: "missing-redis-url" });
  });

  it("parses Redis URL connection settings without exposing credentials", () => {
    expect(redisConnectionFromUrl("redis://worker:secret@localhost:6380/2")).toEqual({
      host: "localhost",
      port: 6380,
      username: "worker",
      password: "secret",
      db: 2
    });
  });
});
