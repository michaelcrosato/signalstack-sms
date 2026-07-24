import {
  CampaignStatus,
  ConsentStatus,
  QueueJobStatus,
  QueueJobType,
  type QueueJob
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCampaignWorkerKillSwitch,
  checkProviderRateLimit,
  clearWorkerHeartbeats,
  getWorkerHeartbeat,
  listWorkerHeartbeats,
  recordWorkerHeartbeat,
  resetEmergencyKillSwitches,
  resetProviderRateLimiters,
  setGlobalEmergencyKillSwitch,
  setOrgEmergencyKillSwitch
} from "@/lib/queue/live-worker-controls";
import {
  processScheduledCampaignQueueJobById
} from "@/lib/queue/worker";
import { outboundCampaignMessageIdempotencyKey } from "@/lib/queue/idempotency";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignRecipientUpdateMany: vi.fn(),
  campaignUpdateMany: vi.fn(),
  claimDueScheduledCampaignQueueJobs: vi.fn(),
  dummySend: vi.fn(),
  messageUpsert: vi.fn(),
  messageAttemptCreate: vi.fn(),
  queueJobFindFirst: vi.fn(),
  queueJobUpdateMany: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    campaign: {
      findFirst: mocks.campaignFindFirst,
      updateMany: mocks.campaignUpdateMany
    },
    campaignRecipient: {
      updateMany: mocks.campaignRecipientUpdateMany
    },
    message: {
      upsert: mocks.messageUpsert
    },
    messageAttempt: {
      create: mocks.messageAttemptCreate
    },
    queueJob: {
      findFirst: mocks.queueJobFindFirst,
      updateMany: mocks.queueJobUpdateMany
    }
  }
}));

vi.mock("@/lib/messaging/provider/dummy-provider", () => ({
  dummyProvider: {
    name: "dummy",
    send: mocks.dummySend
  }
}));

vi.mock("@/lib/db/queue-dispatch", () => ({
  claimDueScheduledCampaignQueueJobs: mocks.claimDueScheduledCampaignQueueJobs
}));

describe("M7 Campaign Worker Controls Stress Harness", () => {
  const now = new Date("2026-05-24T18:00:00.000Z");
  const orgId = "org_stress_m7";
  const campaignId = "campaign_stress_m7";
  const queueJobId = "job_stress_m7";
  const queueJobReference = { queueJobId, expectedOrgId: orgId } as const;

  const baseQueueJob = {
    id: queueJobId,
    orgId,
    campaignId,
    type: QueueJobType.SCHEDULED_CAMPAIGN,
    status: QueueJobStatus.QUEUED,
    idempotencyKey: `scheduled-campaign:${orgId}:${campaignId}:2026-05-24T18:00:00.000Z`,
    payload: {
      version: 1,
      orgId,
      campaignId,
      scheduledAt: "2026-05-24T18:00:00.000Z"
    },
    runAt: now,
    processingToken: null,
    processingExpiresAt: null,
    generation: 1,
    createdAt: now,
    updatedAt: now
  } as QueueJob;

  beforeEach(() => {
    vi.clearAllMocks();
    resetEmergencyKillSwitches();
    clearWorkerHeartbeats();
    resetProviderRateLimiters();

    vi.stubEnv("LIVE_MESSAGING_ENABLED", "false");
    vi.stubEnv("MESSAGING_PROVIDER", "dummy");
    vi.stubEnv("WORKER_DEPLOYMENT_CLASS", "local-demo");
    vi.stubEnv("NODE_ENV", "test");

    mocks.queueJobFindFirst.mockResolvedValue(baseQueueJob);
    mocks.claimDueScheduledCampaignQueueJobs.mockResolvedValue([]);
    mocks.queueJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.campaignUpdateMany.mockResolvedValue({ count: 1 });
    mocks.campaignRecipientUpdateMany.mockResolvedValue({ count: 1 });
    mocks.messageUpsert.mockResolvedValue({ id: "msg_stress_1" });
    mocks.messageAttemptCreate.mockResolvedValue({ id: "attempt_stress_1" });

    mocks.transaction.mockImplementation(async (callback) => {
      return callback({
        campaign: { updateMany: mocks.campaignUpdateMany, findFirst: mocks.campaignFindFirst },
        campaignRecipient: { updateMany: mocks.campaignRecipientUpdateMany },
        message: { upsert: mocks.messageUpsert },
        messageAttempt: { create: mocks.messageAttemptCreate },
        queueJob: { updateMany: mocks.queueJobUpdateMany, findFirst: mocks.queueJobFindFirst }
      });
    });

    mocks.dummySend.mockResolvedValue({
      providerMessageId: "dummy_msg_stress",
      status: "queued"
    });
  });

  describe("1. Mid-flight kill switch activation", () => {
    it("immediately halts active dispatch mid-flight when org kill switch is activated during processing", async () => {
      const recipients = Array.from({ length: 5 }, (_, i) => ({
        id: `recipient_${i + 1}`,
        orgId,
        campaignId,
        contactId: `contact_${i + 1}`,
        contact: {
          id: `contact_${i + 1}`,
          phone: `+1555555010${i}`,
          email: null,
          firstName: `User${i + 1}`,
          lastName: null,
          displayName: null,
          consentStatus: ConsentStatus.OPTED_IN,
          optedOutAt: null,
          archivedAt: null
        }
      }));

      mocks.campaignFindFirst.mockResolvedValue({
        id: campaignId,
        orgId,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now,
        body: "Stress test message for {{firstName}}",
        recipients
      });

      // On the second recipient send, dynamically trigger the org emergency kill switch
      let sendCount = 0;
      mocks.dummySend.mockImplementation(async () => {
        sendCount += 1;
        if (sendCount === 2) {
          // Mid-flight kill switch flip!
          setOrgEmergencyKillSwitch(orgId, true);
        }
        return { providerMessageId: `provider_msg_${sendCount}`, status: "queued" };
      });

      const result = await processScheduledCampaignQueueJobById(queueJobReference, now);

      // Verify immediate halt: only 2 sends executed before kill switch triggered before recipient 3
      expect(sendCount).toBe(2);
      expect(result).toEqual({
        processed: 0,
        skipped: 1,
        blocked: true,
        reason: "emergency-kill-switch-active"
      });

      // Verify the campaign paused and queue job marked failed
      expect(mocks.campaignUpdateMany).toHaveBeenCalledWith({
        where: {
          id: campaignId,
          orgId,
          status: CampaignStatus.SCHEDULED,
          scheduledAt: now
        },
        data: { status: CampaignStatus.PAUSED }
      });
    });

    it("immediately halts active dispatch mid-flight when global kill switch is activated during processing", async () => {
      const recipients = Array.from({ length: 4 }, (_, i) => ({
        id: `recipient_g_${i + 1}`,
        orgId,
        campaignId,
        contactId: `contact_g_${i + 1}`,
        contact: {
          id: `contact_g_${i + 1}`,
          phone: `+1555555020${i}`,
          email: null,
          firstName: `GlobalUser${i + 1}`,
          lastName: null,
          displayName: null,
          consentStatus: ConsentStatus.OPTED_IN,
          optedOutAt: null,
          archivedAt: null
        }
      }));

      mocks.campaignFindFirst.mockResolvedValue({
        id: campaignId,
        orgId,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now,
        body: "Global stress message for {{firstName}}",
        recipients
      });

      let sendCount = 0;
      mocks.dummySend.mockImplementation(async () => {
        sendCount += 1;
        if (sendCount === 1) {
          setGlobalEmergencyKillSwitch(true);
        }
        return { providerMessageId: `provider_g_msg_${sendCount}`, status: "queued" };
      });

      const result = await processScheduledCampaignQueueJobById(queueJobReference, now);

      expect(sendCount).toBe(1);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("emergency-kill-switch-active");
      expect(checkCampaignWorkerKillSwitch(orgId)).toEqual({
        active: true,
        reason: "GLOBAL_EMERGENCY_KILL_SWITCH_ACTIVE"
      });
    });
  });

  describe("2. Worker heartbeat timestamp updates during long batch runs", () => {
    it("updates worker heartbeat timestamp continuously during batch processing", async () => {
      const workerId = `worker-${process.pid}`;

      expect(getWorkerHeartbeat(workerId)).toBeUndefined();

      const hb1 = recordWorkerHeartbeat(workerId, { status: "active", metadata: { batchIndex: 1 } });
      expect(hb1.status).toBe("active");
      expect(hb1.lastHeartbeat).toBeInstanceOf(Date);
      expect(hb1.metadata).toEqual({ batchIndex: 1 });

      const t1 = hb1.lastHeartbeat.getTime();

      // Simulate time step in batch run
      await new Promise((resolve) => setTimeout(resolve, 10));

      const hb2 = recordWorkerHeartbeat(workerId, { status: "active", metadata: { batchIndex: 2 } });
      const t2 = hb2.lastHeartbeat.getTime();

      expect(t2).toBeGreaterThanOrEqual(t1);

      const activeHeartbeats = listWorkerHeartbeats();
      expect(activeHeartbeats).toHaveLength(1);
      expect(activeHeartbeats[0].workerId).toBe(workerId);
      expect(activeHeartbeats[0].metadata).toEqual({ batchIndex: 2 });
    });

    it("automatically emits worker heartbeat at job start during worker execution", async () => {
      const workerId = `worker-${process.pid}`;

      mocks.campaignFindFirst.mockResolvedValue({
        id: campaignId,
        orgId,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now,
        body: "Heartbeat check",
        recipients: [
          {
            id: "rec_hb_1",
            orgId,
            campaignId,
            contactId: "contact_hb_1",
            contact: {
              id: "contact_hb_1",
              phone: "+15555550300",
              email: null,
              firstName: "HeartbeatUser",
              lastName: null,
              displayName: null,
              consentStatus: ConsentStatus.OPTED_IN,
              optedOutAt: null,
              archivedAt: null
            }
          }
        ]
      });

      await processScheduledCampaignQueueJobById(queueJobReference, now);

      const recorded = getWorkerHeartbeat(workerId);
      expect(recorded).toBeDefined();
      expect(recorded?.status).toBe("active");
      expect(recorded?.metadata).toEqual({ orgId, jobId: queueJobId });
    });
  });

  describe("3. Provider rate limit enforcement and backpressure delays", () => {
    it("enforces max per second rate limits and returns retryAfterMs backpressure", () => {
      const rateLimitOrg = "org_rate_stress";

      // Allow first 3 sends when maxPerSecond = 3
      for (let i = 0; i < 3; i++) {
        const check = checkProviderRateLimit(rateLimitOrg, { maxPerSecond: 3 });
        expect(check.allowed).toBe(true);
      }

      // 4th send in the same second must be rejected with retryAfterMs
      const throttled = checkProviderRateLimit(rateLimitOrg, { maxPerSecond: 3 });
      expect(throttled.allowed).toBe(false);
      expect(throttled.retryAfterMs).toBeGreaterThan(0);
      expect(throttled.retryAfterMs).toBeLessThanOrEqual(1000);
    });

    it("isolates rate limiting per tenant organization", () => {
      const orgA = "org_A_rate";
      const orgB = "org_B_rate";

      // Max out orgA
      checkProviderRateLimit(orgA, { maxPerSecond: 1 });
      const throttledA = checkProviderRateLimit(orgA, { maxPerSecond: 1 });
      expect(throttledA.allowed).toBe(false);

      // OrgB should still be allowed
      const allowedB = checkProviderRateLimit(orgB, { maxPerSecond: 1 });
      expect(allowedB.allowed).toBe(true);
    });
  });

  describe("4. Worker crash recovery and outbox claim idempotency", () => {
    it("recovers an abandoned processing lease from a crashed worker", async () => {
      const crashedToken = "crashed_worker_token_123";
      const expiredLeaseTime = new Date(now.getTime() - 1000 * 60 * 5); // 5 minutes ago

      mocks.queueJobFindFirst.mockResolvedValue({
        ...baseQueueJob,
        status: QueueJobStatus.PROCESSING,
        processingToken: crashedToken,
        processingExpiresAt: expiredLeaseTime
      });

      mocks.campaignFindFirst.mockResolvedValue({
        id: campaignId,
        orgId,
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now,
        body: "Crash recovery test",
        recipients: [
          {
            id: "rec_crash_1",
            orgId,
            campaignId,
            contactId: "contact_crash_1",
            contact: {
              id: "contact_crash_1",
              phone: "+15555550400",
              email: null,
              firstName: "CrashUser",
              lastName: null,
              displayName: null,
              consentStatus: ConsentStatus.OPTED_IN,
              optedOutAt: null,
              archivedAt: null
            }
          }
        ]
      });

      const result = await processScheduledCampaignQueueJobById(queueJobReference, now);

      expect(result).toEqual({ processed: 1, skipped: 0, blocked: false });

      // Verify the claim update query targeted expired leases for recovery
      const claimCall = mocks.queueJobUpdateMany.mock.calls.find(
        ([input]) => input.data.status === QueueJobStatus.PROCESSING
      )?.[0];

      expect(claimCall.where.OR).toContainEqual({
        status: QueueJobStatus.PROCESSING,
        OR: [
          { processingToken: null },
          { processingExpiresAt: null },
          { processingExpiresAt: { lte: now } }
        ]
      });

      // New token assigned to caller
      expect(claimCall.data.processingToken).not.toBe(crashedToken);
    });

    it("uses deterministic idempotency keys to guarantee outbox idempotency", () => {
      const key1 = outboundCampaignMessageIdempotencyKey(orgId, queueJobId, "contact_id_99");
      const key2 = outboundCampaignMessageIdempotencyKey(orgId, queueJobId, "contact_id_99");
      const key3 = outboundCampaignMessageIdempotencyKey(orgId, queueJobId, "contact_id_100");

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).toBe(`dummy-outbound:${orgId}:${queueJobId}:contact_id_99`);
    });
  });
});
