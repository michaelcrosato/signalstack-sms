import {
  CampaignRecipientStatus,
  CampaignStatus,
  ConsentStatus,
  QueueJobStatus,
  QueueJobType,
  type QueueJob
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  processDueScheduledCampaignJobs,
  processScheduledCampaignQueueJobById
} from "@/lib/queue/worker";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignRecipientUpdateMany: vi.fn(),
  campaignUpdateMany: vi.fn(),
  claimDueScheduledCampaignQueueJobs: vi.fn(),
  dummySend: vi.fn(),
  messageUpsert: vi.fn(),
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

let activeTransactions = 0;

describe("scheduled campaign worker processing", () => {
  const now = new Date("2026-05-24T18:00:00.000Z");
  const queueJobReference = { queueJobId: "queue_job_demo", expectedOrgId: "org_demo" } as const;
  const queueJob = {
    id: "queue_job_demo",
    orgId: "org_demo",
    campaignId: "campaign_demo",
    type: QueueJobType.SCHEDULED_CAMPAIGN,
    status: QueueJobStatus.QUEUED,
    idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-24T18:00:00.000Z",
    payload: {
      version: 1,
      orgId: "org_demo",
      campaignId: "campaign_demo",
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
    vi.stubEnv("LIVE_MESSAGING_ENABLED", "false");
    vi.stubEnv("MESSAGING_PROVIDER", "dummy");
    vi.stubEnv("WORKER_DEPLOYMENT_CLASS", "local-demo");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DEPLOYMENT_ENV", "");
    vi.stubEnv("APP_ENV", "");
    activeTransactions = 0;
    mocks.queueJobFindFirst.mockResolvedValue(queueJob);
    mocks.claimDueScheduledCampaignQueueJobs.mockResolvedValue([]);
    mocks.queueJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.campaignUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) => {
      activeTransactions += 1;
      try {
        return await callback({
          campaign: { updateMany: mocks.campaignUpdateMany },
          queueJob: { updateMany: mocks.queueJobUpdateMany }
        });
      } finally {
        activeTransactions -= 1;
      }
    });
    mocks.dummySend.mockImplementation(async () => {
      expect(activeTransactions).toBe(0);
      return {
        providerMessageId: "dummy_dummy-outbound:org_demo:queue_job_demo:contact_allowed",
        status: "queued"
      };
    });
  });

  it("skips recipients blocked by send-time consent rechecks while sending allowed local recipients", async () => {
    const allowedContact = {
      id: "contact_allowed",
      phone: "+15555550100",
      email: null,
      firstName: "Ada",
      lastName: null,
      displayName: null,
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };
    const blockedContact = {
      id: "contact_blocked",
      phone: "+15555550101",
      email: null,
      firstName: "Grace",
      lastName: null,
      displayName: null,
      consentStatus: ConsentStatus.OPTED_OUT,
      optedOutAt: new Date("2026-05-24T11:00:00.000Z"),
      archivedAt: null
    };
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: now,
      body: "Hi {{firstName}}, your local demo invite is ready.",
      recipients: [
        {
          id: "campaign_recipient_allowed",
          orgId: "org_demo",
          campaignId: "campaign_demo",
          contactId: "contact_allowed",
          contact: allowedContact
        },
        {
          id: "campaign_recipient_blocked",
          orgId: "org_demo",
          campaignId: "campaign_demo",
          contactId: "contact_blocked",
          contact: blockedContact
        }
      ]
    });

    await expect(processScheduledCampaignQueueJobById(queueJobReference, now)).resolves.toEqual({
      processed: 1,
      skipped: 0,
      blocked: false
    });

    expect(mocks.dummySend).toHaveBeenCalledTimes(1);
    expect(mocks.dummySend).toHaveBeenCalledWith({
      to: "+15555550100",
      from: "demo-signalstack",
      body: "Hi Ada, your local demo invite is ready.",
      orgId: "org_demo",
      idempotencyKey: "dummy-outbound:org_demo:queue_job_demo:contact_allowed"
    });
    expect(mocks.messageUpsert).toHaveBeenCalledWith({
      where: {
        orgId_idempotencyKey: {
          orgId: "org_demo",
          idempotencyKey: "dummy-outbound:org_demo:queue_job_demo:contact_allowed"
        }
      },
      update: {},
      create: {
        orgId: "org_demo",
        contactId: "contact_allowed",
        campaignId: "campaign_demo",
        direction: "OUTBOUND",
        body: "Hi Ada, your local demo invite is ready.",
        applicationStatus: "PROCESSING",
        transport: "DUMMY",
        destination: "+15555550100",
        idempotencyKey: "dummy-outbound:org_demo:queue_job_demo:contact_allowed"
      }
    });
    expect(mocks.campaignRecipientUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { orgId: "org_demo", id: { in: ["campaign_recipient_allowed"] } },
      data: { status: CampaignRecipientStatus.PENDING, blockReason: null }
    });
    expect(mocks.campaignRecipientUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { orgId: "org_demo", id: { in: ["campaign_recipient_blocked"] } },
      data: {
        status: CampaignRecipientStatus.BLOCKED,
        blockReason: "CONSENT_NOT_OPTED_IN,CONTACT_OPTED_OUT"
      }
    });
    const claimCall = mocks.queueJobUpdateMany.mock.calls.find(
      ([input]) => input.data.status === QueueJobStatus.PROCESSING
    )?.[0];
    expect(claimCall).toEqual({
      where: expect.objectContaining({
        id: "queue_job_demo",
        orgId: "org_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        runAt: { lte: now }
      }),
      data: {
        status: QueueJobStatus.PROCESSING,
        processingToken: expect.any(String),
        processingExpiresAt: expect.any(Date)
      }
    });
    const renewalCallIndex = mocks.queueJobUpdateMany.mock.calls.findIndex(
      ([input]) => input.data.processingExpiresAt instanceof Date && input.data.status === undefined
    );
    expect(renewalCallIndex).toBeGreaterThan(-1);
    expect(mocks.queueJobUpdateMany.mock.invocationCallOrder[renewalCallIndex]).toBeLessThan(
      mocks.dummySend.mock.invocationCallOrder[0]
    );
    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "queue_job_demo",
        orgId: "org_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING,
        processingToken: claimCall!.data.processingToken
      },
      data: {
        status: QueueJobStatus.COMPLETED,
        processingToken: null,
        processingExpiresAt: null
      }
    });
    expect(mocks.campaignUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign_demo",
        orgId: "org_demo",
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now
      },
      data: { status: CampaignStatus.COMPLETED }
    });
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it("cancels stale queued jobs before they can send from an old schedule", async () => {
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: new Date("2026-05-24T13:00:00.000Z"),
      body: "Hi {{firstName}}, your local demo invite is ready.",
      recipients: []
    });

    await expect(processScheduledCampaignQueueJobById(queueJobReference, now)).resolves.toEqual({
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "stale-schedule"
    });

    const staleClaimCall = mocks.queueJobUpdateMany.mock.calls.find(
      ([input]) => input.data.status === QueueJobStatus.PROCESSING
    )?.[0];
    expect(staleClaimCall?.data.processingToken).toEqual(expect.any(String));
    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "queue_job_demo",
        orgId: "org_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING,
        processingToken: staleClaimCall!.data.processingToken
      },
      data: {
        status: QueueJobStatus.CANCELLED,
        processingToken: null,
        processingExpiresAt: null
      }
    });
    expect(mocks.campaignRecipientUpdateMany).not.toHaveBeenCalled();
    expect(mocks.dummySend).not.toHaveBeenCalled();
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
    expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
  });

  it("does not claim a scheduled job before its durable run time", async () => {
    mocks.queueJobFindFirst.mockResolvedValue({
      ...queueJob,
      runAt: new Date("2026-05-24T19:00:00.000Z")
    });

    await expect(processScheduledCampaignQueueJobById(queueJobReference, now)).resolves.toEqual({
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "not-due"
    });

    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.campaignFindFirst).not.toHaveBeenCalled();
    expect(mocks.dummySend).not.toHaveBeenCalled();
  });

  it("processes database-dispatched claims only inside the returned organization", async () => {
    const processingToken = "database-dispatch-token";
    const processingExpiresAt = new Date(now.getTime() + 60_000);
    mocks.claimDueScheduledCampaignQueueJobs.mockResolvedValue([
      {
        queueJobId: queueJob.id,
        expectedOrgId: queueJob.orgId,
        processingToken,
        processingExpiresAt
      }
    ]);
    mocks.queueJobFindFirst.mockResolvedValue({
      ...queueJob,
      status: QueueJobStatus.PROCESSING,
      processingToken,
      processingExpiresAt
    });
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: new Date("2026-05-24T13:00:00.000Z"),
      body: "Hi",
      recipients: []
    });

    await expect(processDueScheduledCampaignJobs(now, { maxJobsPerPoll: 1 })).resolves.toEqual({
      processed: 0,
      skipped: 1,
      blocked: false
    });

    expect(mocks.claimDueScheduledCampaignQueueJobs).toHaveBeenCalledWith(now, 1);
    expect(mocks.queueJobFindFirst).toHaveBeenCalledWith({
      where: {
        id: "queue_job_demo",
        orgId: "org_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING,
        processingToken
      }
    });
  });

  it("rejects a queue row that does not match the caller-supplied organization", async () => {
    await expect(
      processScheduledCampaignQueueJobById(
        { queueJobId: "queue_job_demo", expectedOrgId: "org_other" },
        now
      )
    ).resolves.toEqual({
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "org-mismatch"
    });

    expect(mocks.queueJobFindFirst).toHaveBeenCalledWith({
      where: {
        id: "queue_job_demo",
        orgId: "org_other",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: { in: [QueueJobStatus.QUEUED, QueueJobStatus.PROCESSING] }
      }
    });
    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.campaignFindFirst).not.toHaveBeenCalled();
    expect(mocks.dummySend).not.toHaveBeenCalled();
  });

  it("recovers an expired processing lease with a new owner token", async () => {
    mocks.queueJobFindFirst.mockResolvedValue({
      ...queueJob,
      status: QueueJobStatus.PROCESSING,
      processingToken: "abandoned-token",
      processingExpiresAt: new Date(now.getTime() - 1)
    });
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: new Date("2026-05-24T13:00:00.000Z"),
      body: "Hi {{firstName}}",
      recipients: []
    });

    await expect(processScheduledCampaignQueueJobById(queueJobReference, now)).resolves.toEqual({
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "stale-schedule"
    });

    const claimCall = mocks.queueJobUpdateMany.mock.calls[0][0];
    expect(claimCall.where.OR).toEqual([
      { status: QueueJobStatus.QUEUED },
      {
        status: QueueJobStatus.PROCESSING,
        OR: [
          { processingToken: null },
          { processingExpiresAt: null },
          { processingExpiresAt: { lte: now } }
        ]
      }
    ]);
    expect(claimCall.data.processingToken).not.toBe("abandoned-token");
    expect(claimCall.data.processingToken).toEqual(expect.any(String));
  });

  it("applies the demo-only provider gate before reading or claiming durable jobs", async () => {
    vi.stubEnv("LIVE_MESSAGING_ENABLED", "true");

    await expect(processScheduledCampaignQueueJobById(queueJobReference, now)).resolves.toEqual({
      processed: 0,
      skipped: 0,
      blocked: true,
      reason: "provider-blocked"
    });

    expect(mocks.queueJobFindFirst).not.toHaveBeenCalled();
    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.campaignFindFirst).not.toHaveBeenCalled();
    expect(mocks.dummySend).not.toHaveBeenCalled();
  });

  it("allows only one concurrent worker to claim and process the same queued job", async () => {
    const contact = {
      id: "contact_allowed",
      phone: "+15555550100",
      email: null,
      firstName: "Ada",
      lastName: null,
      displayName: null,
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: now,
      body: "Hi {{firstName}}, your local demo invite is ready.",
      recipients: [
        {
          id: "campaign_recipient_allowed",
          orgId: "org_demo",
          campaignId: "campaign_demo",
          contactId: contact.id,
          contact
        }
      ]
    });
    mocks.dummySend.mockResolvedValue({
      providerMessageId: "dummy_dummy-outbound:org_demo:queue_job_demo:contact_allowed",
      status: "queued"
    });

    let claimed = false;
    mocks.queueJobUpdateMany.mockImplementation(async (input) => {
      if (input.data.status !== QueueJobStatus.PROCESSING) {
        return { count: 1 };
      }

      if (claimed) {
        return { count: 0 };
      }

      claimed = true;
      return { count: 1 };
    });

    const results = await Promise.all([
      processScheduledCampaignQueueJobById(queueJobReference, now),
      processScheduledCampaignQueueJobById(queueJobReference, now)
    ]);

    expect(results).toEqual([
      { processed: 1, skipped: 0, blocked: false },
      { processed: 0, skipped: 1, blocked: false, reason: "already-claimed" }
    ]);
    expect(mocks.dummySend).toHaveBeenCalledTimes(1);
    expect(mocks.messageUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.campaignUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses a completion whose tenant schedule guard changed and uses the atomic failure path", async () => {
    const contact = {
      id: "contact_allowed",
      phone: "+15555550100",
      email: null,
      firstName: "Ada",
      lastName: null,
      displayName: null,
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: now,
      body: "Hi {{firstName}}",
      recipients: [
        {
          id: "campaign_recipient_allowed",
          orgId: "org_demo",
          campaignId: "campaign_demo",
          contactId: contact.id,
          contact
        }
      ]
    });
    mocks.campaignUpdateMany.mockResolvedValue({ count: 0 });

    await expect(processScheduledCampaignQueueJobById(queueJobReference, now)).resolves.toEqual({
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "processing-failed"
    });

    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: QueueJobStatus.COMPLETED })
      })
    );
    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: QueueJobStatus.FAILED })
      })
    );
    expect(mocks.campaignUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "campaign_demo",
        orgId: "org_demo",
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now
      },
      data: { status: CampaignStatus.COMPLETED }
    });
    expect(mocks.campaignUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "campaign_demo",
        orgId: "org_demo",
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now
      },
      data: { status: CampaignStatus.PAUSED }
    });
  });

  it("fails the claimed job and pauses its tenant campaign when processing throws", async () => {
    const contact = {
      id: "contact_allowed",
      phone: "+15555550100",
      email: null,
      firstName: "Ada",
      lastName: null,
      displayName: null,
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED,
      scheduledAt: now,
      body: "Hi {{firstName}}, your local demo invite is ready.",
      recipients: [
        {
          id: "campaign_recipient_allowed",
          orgId: "org_demo",
          campaignId: "campaign_demo",
          contactId: contact.id,
          contact
        }
      ]
    });
    mocks.dummySend.mockRejectedValueOnce(new Error("simulated provider failure"));

    await expect(processScheduledCampaignQueueJobById(queueJobReference, now)).resolves.toEqual({
      processed: 0,
      skipped: 1,
      blocked: false,
      reason: "processing-failed"
    });

    const failedClaimCall = mocks.queueJobUpdateMany.mock.calls.find(
      ([input]) => input.data.status === QueueJobStatus.PROCESSING
    )?.[0];
    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "queue_job_demo",
        orgId: "org_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING,
        processingToken: failedClaimCall!.data.processingToken
      },
      data: {
        status: QueueJobStatus.FAILED,
        processingToken: null,
        processingExpiresAt: null
      }
    });
    expect(mocks.campaignUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign_demo",
        orgId: "org_demo",
        status: CampaignStatus.SCHEDULED,
        scheduledAt: now
      },
      data: { status: CampaignStatus.PAUSED }
    });
    expect(mocks.messageUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalled();
  });
});
