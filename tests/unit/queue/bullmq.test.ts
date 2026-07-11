import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildScheduledCampaignBullMqJob,
  enqueueScheduledCampaignBullMqJob,
  getQueueBackend,
  scheduledCampaignBullMqJobName,
  scheduledCampaignBullMqQueueName
} from "@/lib/queue/bullmq";
import { redisConnectionFromUrl } from "@/lib/queue/redis";

const mocks = vi.hoisted(() => ({
  queueConstruct: vi.fn(),
  queueAdd: vi.fn(),
  queueCounts: vi.fn(),
  queueClose: vi.fn()
}));

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(...args: unknown[]) {
      mocks.queueConstruct(...args);
    }

    add(...args: unknown[]) {
      return mocks.queueAdd(...args);
    }

    getJobCounts() {
      return mocks.queueCounts();
    }

    close() {
      return mocks.queueClose();
    }
  }
}));

const payload = {
  version: 1 as const,
  orgId: "org_demo",
  campaignId: "campaign_demo",
  scheduledAt: "2026-05-20T12:00:00.000Z"
};
const queueJobGeneration = 1;
const generatedBullMqJobId = `queue_job_demo-${queueJobGeneration}`;

describe("BullMQ queue foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueAdd.mockResolvedValue({ id: "queue_job_demo" });
    mocks.queueCounts.mockResolvedValue({ waiting: 0, active: 0, delayed: 1 });
    mocks.queueClose.mockResolvedValue(undefined);
  });

  it("keeps database queue backend as the default", () => {
    expect(getQueueBackend({})).toBe("database");
    expect(getQueueBackend({ QUEUE_BACKEND: "database" })).toBe("database");
    expect(getQueueBackend({ QUEUE_BACKEND: "bullmq" })).toBe("bullmq");
    expect(getQueueBackend({ QUEUE_BACKEND: "redis" })).toBe("database");
  });

  it("builds deterministic scheduled campaign BullMQ jobs with default and custom TTL age structures", () => {
    const jobDefault = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      queueJobGeneration,
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
        jobId: generatedBullMqJobId,
        delay: 10000,
        attempts: 3,
        backoff: { type: "fixed", delay: 5 * 60 * 1000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 }
      },
      delayMs: 10000
    });

    const jobCustom = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      queueJobGeneration,
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

  it("changes the BullMQ job ID only when the authoritative durable generation changes", () => {
    const original = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      queueJobGeneration,
      payload,
      runAt: new Date("2026-05-20T12:00:10.000Z")
    });
    const repeatedMirror = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      queueJobGeneration,
      payload,
      runAt: new Date("2026-05-20T12:00:10.000Z")
    });
    const reopened = buildScheduledCampaignBullMqJob({
      queueJobId: "queue_job_demo",
      queueJobGeneration: 2,
      payload,
      runAt: new Date("2026-05-20T12:00:10.000Z")
    });

    expect(repeatedMirror.options.jobId).toBe(original.options.jobId);
    expect(reopened.options.jobId).not.toBe(original.options.jobId);
    expect(reopened.data.queueJobId).toBe("queue_job_demo");
  });


  it("no-ops safely unless BullMQ and Redis are explicitly configured", async () => {
    await expect(
      enqueueScheduledCampaignBullMqJob({
        id: "queue_job_demo",
        idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
        payload,
        runAt: new Date("2026-05-20T12:00:00.000Z"),
        generation: queueJobGeneration
      })
    ).resolves.toEqual({ enqueued: false, reason: "backend-disabled" });

    await expect(
      enqueueScheduledCampaignBullMqJob(
        {
          id: "queue_job_demo",
          idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
          payload,
          runAt: new Date("2026-05-20T12:00:00.000Z"),
          generation: queueJobGeneration
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

  it("returns a secret-safe mirror failure when Redis configuration or enqueue setup throws", async () => {
    const queueJob = {
      id: "queue_job_demo",
      idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
      payload,
      runAt: new Date("2026-05-20T12:00:00.000Z"),
      generation: queueJobGeneration
    };

    await expect(
      enqueueScheduledCampaignBullMqJob(queueJob, {
        env: { QUEUE_BACKEND: "bullmq", REDIS_URL: "not-a-valid-url" }
      })
    ).resolves.toEqual({
      enqueued: false,
      reason: "enqueue-failed",
      error: "BullMQ enqueue failed."
    });

    mocks.queueAdd.mockRejectedValueOnce(new Error("redis://user:secret@example.test"));
    await expect(
      enqueueScheduledCampaignBullMqJob(queueJob, {
        env: { QUEUE_BACKEND: "bullmq", REDIS_URL: "redis://localhost:6379" }
      })
    ).resolves.toEqual({
      enqueued: false,
      reason: "enqueue-failed",
      error: "BullMQ enqueue failed."
    });
    expect(mocks.queueClose).toHaveBeenCalledTimes(1);
  });

  it("does not let a retained BullMQ job suppress a reopened durable generation", async () => {
    const durableJob = {
      id: "queue_job_demo",
      idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
      payload,
      runAt: new Date("2026-05-20T12:00:00.000Z"),
      generation: queueJobGeneration
    };
    const env = { QUEUE_BACKEND: "bullmq", REDIS_URL: "redis://localhost:6379" };

    const original = await enqueueScheduledCampaignBullMqJob(durableJob, { env });
    const reopened = await enqueueScheduledCampaignBullMqJob(
      { ...durableJob, generation: 2 },
      { env }
    );

    expect(original).toMatchObject({ enqueued: true, jobId: generatedBullMqJobId });
    expect(reopened).toMatchObject({ enqueued: true });
    expect(reopened.enqueued && reopened.jobId).not.toBe(generatedBullMqJobId);
    expect(mocks.queueAdd.mock.calls[0][2]).toMatchObject({ jobId: generatedBullMqJobId });
    expect(mocks.queueAdd.mock.calls[1][2]).toMatchObject({ jobId: reopened.enqueued ? reopened.jobId : "" });
    expect(mocks.queueAdd.mock.calls[0][1]).toMatchObject({ queueJobId: "queue_job_demo" });
    expect(mocks.queueAdd.mock.calls[1][1]).toMatchObject({ queueJobId: "queue_job_demo" });
  });

  it("does not let a mirror close failure override a successful enqueue result", async () => {
    mocks.queueClose.mockRejectedValueOnce(new Error("close failed"));

    await expect(
      enqueueScheduledCampaignBullMqJob(
        {
          id: "queue_job_demo",
          idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z",
          payload,
          runAt: new Date("2026-05-20T12:00:00.000Z"),
          generation: queueJobGeneration
        },
        {
          env: { QUEUE_BACKEND: "bullmq", REDIS_URL: "redis://localhost:6379" },
          now: new Date("2026-05-20T12:00:00.000Z")
        }
      )
    ).resolves.toMatchObject({
      enqueued: true,
      jobId: generatedBullMqJobId
    });
  });
});
