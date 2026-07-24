import {
  CampaignRecipientStatus,
  CampaignStatus,
  ConsentStatus,
  QueueJobStatus,
  QueueJobType,
  type QueueJob
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processScheduledCampaignQueueJobById } from "@/lib/queue/worker";
import { resetEmergencyKillSwitches, clearWorkerHeartbeats, resetProviderRateLimiters } from "@/lib/queue/live-worker-controls";

const callOrder: string[] = [];

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignRecipientUpdateMany: vi.fn(),
  campaignUpdateMany: vi.fn(),
  contactFindFirst: vi.fn(),
  dummySend: vi.fn(),
  messageUpsert: vi.fn(),
  messageUpdate: vi.fn(),
  messageAttemptCreate: vi.fn(),
  messageAttemptUpdate: vi.fn(),
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
    contact: {
      findFirst: mocks.contactFindFirst
    },
    message: {
      upsert: mocks.messageUpsert,
      update: mocks.messageUpdate
    },
    messageAttempt: {
      create: mocks.messageAttemptCreate,
      update: mocks.messageAttemptUpdate
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

describe("M7 Empirical Challenger: Durable Outbox Ordering & Mid-Flight Opt-Out", () => {
  const orgId = "org_verify_m7";
  const campaignId = "campaign_verify_m7";
  const queueJobId = "job_verify_m7";
  const now = new Date("2026-06-01T15:00:00.000Z"); // 15:00 UTC = 11:00 AM EDT (Active hours in NY)

  const baseQueueJob = {
    id: queueJobId,
    orgId,
    campaignId,
    type: QueueJobType.SCHEDULED_CAMPAIGN,
    status: QueueJobStatus.QUEUED,
    idempotencyKey: `scheduled-campaign:${orgId}:${campaignId}:2026-06-01T15:00:00.000Z`,
    payload: {
      version: 1,
      orgId,
      campaignId,
      scheduledAt: "2026-06-01T15:00:00.000Z"
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
    callOrder.length = 0;
    resetEmergencyKillSwitches();
    clearWorkerHeartbeats();
    resetProviderRateLimiters();

    vi.stubEnv("LIVE_MESSAGING_ENABLED", "false");
    vi.stubEnv("MESSAGING_PROVIDER", "dummy");
    vi.stubEnv("WORKER_DEPLOYMENT_CLASS", "local-demo");
    vi.stubEnv("NODE_ENV", "test");

    mocks.queueJobFindFirst.mockResolvedValue(baseQueueJob);
    mocks.queueJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.campaignUpdateMany.mockResolvedValue({ count: 1 });
    mocks.campaignRecipientUpdateMany.mockResolvedValue({ count: 1 });

    mocks.transaction.mockImplementation(async (callback) => {
      callOrder.push("tx:start");
      const res = await callback({
        campaign: { updateMany: mocks.campaignUpdateMany, findFirst: mocks.campaignFindFirst },
        campaignRecipient: { updateMany: mocks.campaignRecipientUpdateMany },
        contact: { findFirst: mocks.contactFindFirst },
        message: { upsert: mocks.messageUpsert, update: mocks.messageUpdate },
        messageAttempt: { create: mocks.messageAttemptCreate, update: mocks.messageAttemptUpdate },
        queueJob: { updateMany: mocks.queueJobUpdateMany, findFirst: mocks.queueJobFindFirst }
      });
      callOrder.push("tx:commit");
      return res;
    });

    mocks.messageUpsert.mockImplementation(async () => {
      callOrder.push("db:message:upsert");
      return { id: "msg_verify_1" };
    });

    mocks.messageAttemptCreate.mockImplementation(async () => {
      callOrder.push("db:messageAttempt:create");
      return { id: "attempt_verify_1" };
    });

    mocks.messageUpdate.mockImplementation(async () => {
      callOrder.push("db:message:update");
      return { id: "msg_verify_1" };
    });

    mocks.dummySend.mockImplementation(async () => {
      callOrder.push("external:dummySend");
      return { providerMessageId: "prov_msg_1", status: "queued" };
    });
  });

  it("proves durable-before-external outbox transaction ordering (DB write completes before API call)", async () => {
    const contact = {
      id: "c-1",
      phone: "+12125550199", // NY area code
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };

    mocks.campaignFindFirst.mockResolvedValue({
      id: campaignId,
      orgId,
      status: CampaignStatus.SCHEDULED,
      scheduledAt: now,
      body: "Outbox order test",
      recipients: [
        {
          id: "rec-1",
          orgId,
          campaignId,
          contactId: "c-1",
          contact
        }
      ]
    });

    mocks.contactFindFirst.mockResolvedValue(contact);

    const result = await processScheduledCampaignQueueJobById({ queueJobId, expectedOrgId: orgId }, now);

    expect(result).toEqual({ processed: 1, skipped: 0, blocked: false });

    // Verify call order:
    // 1. Outbox DB Transaction (message upsert & attempt create) starts and commits.
    // 2. external send call (dummySend) runs AFTER outbox DB transaction commit.
    // 3. Post-send DB update transaction runs.

    const messageUpsertIdx = callOrder.indexOf("db:message:upsert");
    const attemptCreateIdx = callOrder.indexOf("db:messageAttempt:create");
    const externalSendIdx = callOrder.indexOf("external:dummySend");

    expect(messageUpsertIdx).toBeGreaterThan(-1);
    expect(attemptCreateIdx).toBeGreaterThan(messageUpsertIdx);
    expect(externalSendIdx).toBeGreaterThan(attemptCreateIdx);

    // Ensure outbox transaction committed BEFORE external send:
    // tx:commit corresponding to outbox tx must be before externalSendIdx
    const txCommitsBeforeSend = callOrder.slice(0, externalSendIdx).filter(c => c === "tx:commit");
    expect(txCommitsBeforeSend.length).toBeGreaterThanOrEqual(2); // Initial preflight tx + outbox tx
  });

  it("blocks recipient mid-flight if contact opts out right before send attempt", async () => {
    const contactOptedIn = {
      id: "c-optout-midflight",
      phone: "+12125550199",
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };

    const contactOptedOutFresh = {
      ...contactOptedIn,
      consentStatus: ConsentStatus.OPTED_OUT,
      optedOutAt: new Date()
    };

    mocks.campaignFindFirst.mockResolvedValue({
      id: campaignId,
      orgId,
      status: CampaignStatus.SCHEDULED,
      scheduledAt: now,
      body: "Mid-flight optout test",
      recipients: [
        {
          id: "rec-optout-1",
          orgId,
          campaignId,
          contactId: "c-optout-midflight",
          contact: contactOptedIn
        }
      ]
    });

    // Fresh DB fetch returns contact with OPTED_OUT
    mocks.contactFindFirst.mockResolvedValue(contactOptedOutFresh);

    await processScheduledCampaignQueueJobById({ queueJobId, expectedOrgId: orgId }, now);

    // dummySend must NOT have been called!
    expect(mocks.dummySend).not.toHaveBeenCalled();

    // campaignRecipient must be updated to BLOCKED with CONTACT_OPTED_OUT
    expect(mocks.campaignRecipientUpdateMany).toHaveBeenLastCalledWith({
      where: { orgId, id: "rec-optout-1" },
      data: { status: CampaignRecipientStatus.BLOCKED, blockReason: expect.stringContaining("CONTACT_OPTED_OUT") }
    });
  });
});
