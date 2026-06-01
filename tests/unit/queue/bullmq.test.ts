import { describe, expect, it } from "vitest";
import {
  buildScheduledCampaignBullMqJob,
  enqueueScheduledCampaignBullMqJob,
  getQueueBackend,
  scheduledCampaignBullMqJobName,
  scheduledCampaignBullMqQueueName
} from "@/lib/queue/bullmq";


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

  it("builds deterministic scheduled campaign BullMQ jobs with default and custom TTL age structures", () => {
    const jobDefault = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
      payload,
      runAt: new Date("2026-05-20T12:00:10.000Z"),
      now: new Date("2026-05-20T12:00:00.000Z")
    });

    expect(jobDefault).toEqual({
      name: scheduledCampaignBullMqJobName,
      data: {
        queueJobId: "queue_job_demo",
        ...payload
      },
      options: {
        jobId: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
        delay: 10000,
        attempts: 3,
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 }
      },
      delayMs: 10000
    });

    const jobCustom = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
      payload,
      runAt: new Date("2026-05-20T12:00:10.000Z"),
      now: new Date("2026-05-20T12:00:00.000Z"),
      env: {
        BULLMQ_REMOVE_ON_COMPLETE_AGE_SEC: "3600",
        BULLMQ_REMOVE_ON_FAIL_AGE_SEC: "7200"
      }
    });

    expect(jobCustom.options.removeOnComplete).toEqual({ age: 3600 });
    expect(jobCustom.options.removeOnFail).toEqual({ age: 7200 });

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
});
