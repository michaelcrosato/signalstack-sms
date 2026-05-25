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

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignRecipientUpdateMany: vi.fn(),
  campaignUpdate: vi.fn(),
  dummySend: vi.fn(),
  messageUpsert: vi.fn(),
  queueJobFindFirst: vi.fn(),
  queueJobUpdate: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    campaign: {
      findFirst: mocks.campaignFindFirst,
      update: mocks.campaignUpdate
    },
    campaignRecipient: {
      updateMany: mocks.campaignRecipientUpdateMany
    },
    message: {
      upsert: mocks.messageUpsert
    },
    queueJob: {
      findFirst: mocks.queueJobFindFirst,
      update: mocks.queueJobUpdate
    }
  }
}));

vi.mock("@/lib/messaging/provider/dummy-provider", () => ({
  dummyProvider: {
    name: "dummy",
    send: mocks.dummySend
  }
}));

describe("scheduled campaign worker processing", () => {
  const now = new Date("2026-05-24T12:00:00.000Z");
  const queueJob = {
    id: "queue_job_demo",
    orgId: "org_demo",
    campaignId: "campaign_demo",
    type: QueueJobType.SCHEDULED_CAMPAIGN,
    status: QueueJobStatus.QUEUED,
    idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-24T12:00:00.000Z",
    payload: {
      version: 1,
      orgId: "org_demo",
      campaignId: "campaign_demo",
      scheduledAt: "2026-05-24T12:00:00.000Z"
    },
    runAt: now,
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
    mocks.queueJobFindFirst.mockResolvedValue(queueJob);
    mocks.dummySend.mockResolvedValue({
      providerMessageId: "dummy_dummy-outbound:queue_job_demo:contact_allowed",
      status: "queued"
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

    await expect(processScheduledCampaignQueueJobById("queue_job_demo", now)).resolves.toEqual({
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
      idempotencyKey: "dummy-outbound:queue_job_demo:contact_allowed"
    });
    expect(mocks.messageUpsert).toHaveBeenCalledWith({
      where: {
        orgId_idempotencyKey: {
          orgId: "org_demo",
          idempotencyKey: "dummy-outbound:queue_job_demo:contact_allowed"
        }
      },
      update: {},
      create: {
        orgId: "org_demo",
        contactId: "contact_allowed",
        campaignId: "campaign_demo",
        direction: "OUTBOUND",
        body: "Hi Ada, your local demo invite is ready.",
        providerMessageId: "dummy_dummy-outbound:queue_job_demo:contact_allowed",
        idempotencyKey: "dummy-outbound:queue_job_demo:contact_allowed"
      }
    });
    expect(mocks.campaignRecipientUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { orgId: "org_demo", id: { in: ["campaign_recipient_allowed"] } },
      data: { status: CampaignRecipientStatus.PENDING, blockReason: null }
    });
    expect(mocks.campaignRecipientUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { orgId: "org_demo", id: "campaign_recipient_blocked" },
      data: {
        status: CampaignRecipientStatus.BLOCKED,
        blockReason: "CONSENT_NOT_OPTED_IN,CONTACT_OPTED_OUT"
      }
    });
    expect(mocks.queueJobUpdate).toHaveBeenCalledWith({
      where: { id: "queue_job_demo" },
      data: { status: QueueJobStatus.COMPLETED }
    });
    expect(mocks.campaignUpdate).toHaveBeenCalledWith({
      where: { id: "campaign_demo" },
      data: { status: CampaignStatus.COMPLETED }
    });
  });
});
