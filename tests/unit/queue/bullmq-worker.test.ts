import { beforeEach, describe, expect, it, vi } from "vitest";
import { bullMqWorkerCanStart, createScheduledCampaignBullMqWorker } from "@/lib/queue/bullmq-worker";
import { scheduledCampaignBullMqJobDataSchema } from "@/lib/queue/jobs";

const mocks = vi.hoisted(() => ({
  processQueueJob: vi.fn(),
  workerClose: vi.fn(),
  workerConstruct: vi.fn(),
  workerOn: vi.fn(),
  workerProcessor: undefined as undefined | ((job: { data: unknown }) => Promise<unknown>)
}));

vi.mock("bullmq", () => ({
  Worker: class {
    opts: Record<string, unknown>;

    constructor(queueName: string, processor: (job: { data: unknown }) => Promise<unknown>, opts: Record<string, unknown>) {
      this.opts = opts;
      mocks.workerProcessor = processor;
      mocks.workerConstruct(queueName, processor, opts);
    }

    on(...args: unknown[]) {
      mocks.workerOn(...args);
      return this;
    }

    close() {
      return mocks.workerClose();
    }
  }
}));

vi.mock("@/lib/queue/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queue/worker")>();
  return {
    ...actual,
    processScheduledCampaignQueueJobById: mocks.processQueueJob
  };
});

const bullMqWorkerEnv = {
  QUEUE_BACKEND: "bullmq",
  REDIS_URL: "redis://localhost:6379",
  LIVE_MESSAGING_ENABLED: "false",
  MESSAGING_PROVIDER: "dummy"
} as const;

const bullMqJobData = {
  queueJobId: "queue_job_demo",
  version: 1,
  orgId: "org_demo",
  campaignId: "campaign_demo",
  scheduledAt: "2026-05-20T12:00:00.000Z"
} as const;

describe("BullMQ worker foundation", () => {
  const productionLikeRuntimeMarkers = [
    { NODE_ENV: "production" },
    { VERCEL_ENV: "production" },
    { DEPLOYMENT_ENV: "prod" },
    { APP_ENV: "prod" }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workerProcessor = undefined;
    mocks.workerClose.mockResolvedValue(undefined);
  });

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

  it("invokes the processor with the durable ID and acknowledges completed or durably terminal outcomes", async () => {
    const worker = createScheduledCampaignBullMqWorker(bullMqWorkerEnv);
    const processor = mocks.workerProcessor;
    if (!processor) {
      throw new Error("Worker processor was not captured.");
    }

    const completed = { processed: 1, skipped: 0, blocked: false };
    mocks.processQueueJob.mockResolvedValueOnce(completed);
    await expect(processor({ data: bullMqJobData })).resolves.toEqual(completed);
    expect(mocks.processQueueJob).toHaveBeenLastCalledWith({
      queueJobId: "queue_job_demo",
      expectedOrgId: "org_demo"
    });

    const terminal = { processed: 0, skipped: 1, blocked: false, reason: "stale-schedule" };
    mocks.processQueueJob.mockResolvedValueOnce(terminal);
    await expect(processor({ data: bullMqJobData })).resolves.toEqual(terminal);

    await worker.close();
  });

  it.each([
    { reason: "already-claimed", result: { processed: 0, skipped: 1, blocked: false, reason: "already-claimed" } },
    { reason: "not-due", result: { processed: 0, skipped: 1, blocked: false, reason: "not-due" } },
    { reason: "processing-failed", result: { processed: 0, skipped: 1, blocked: false, reason: "processing-failed" } },
    { reason: "provider-blocked", result: { processed: 0, skipped: 0, blocked: true, reason: "provider-blocked" } },
    {
      reason: "production-worker-blocked",
      result: { processed: 0, skipped: 0, blocked: true, reason: "production-worker-blocked" }
    }
  ])("rejects the recoverable $reason outcome so BullMQ applies attempts/backoff", async ({ result }) => {
    const worker = createScheduledCampaignBullMqWorker(bullMqWorkerEnv);
    const processor = mocks.workerProcessor;
    if (!processor) {
      throw new Error("Worker processor was not captured.");
    }
    mocks.processQueueJob.mockResolvedValueOnce(result);

    await expect(processor({ data: bullMqJobData })).rejects.toThrow(
      "Durable queue job has not reached a terminal state."
    );

    await worker.close();
  });

  it("applies lock duration and stalled interval from environment variables in worker options", async () => {
    const worker = createScheduledCampaignBullMqWorker({
      QUEUE_BACKEND: "bullmq",
      REDIS_URL: "redis://localhost:6379",
      LIVE_MESSAGING_ENABLED: "false",
      MESSAGING_PROVIDER: "dummy",
      BULLMQ_LOCK_DURATION_MS: "45000",
      BULLMQ_STALLED_INTERVAL_MS: "15000"
    });

    expect(worker.opts.lockDuration).toBe(45000);
    expect(worker.opts.stalledInterval).toBe(15000);
    await worker.close();
  });
});

