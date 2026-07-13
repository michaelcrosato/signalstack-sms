import {
  CampaignRecipientStatus,
  CampaignStatus,
  ConsentStatus,
  QueueJobStatus
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPublicCampaign,
  createPublicCampaign,
  schedulePublicCampaign
} from "@/lib/public-api/campaigns";

const mocks = vi.hoisted(() => ({ enqueueCustomerWebhookEvent: vi.fn() }));

vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

const createdAt = new Date("2026-07-10T01:02:03.000Z");
const scheduledAt = new Date("2026-07-11T01:02:03.000Z");

function campaignRow(status: CampaignStatus) {
  return {
    id: "campaign_demo",
    templateId: null,
    name: "Launch",
    status,
    body: "Hello",
    scheduledAt: status === CampaignStatus.DRAFT ? null : scheduledAt,
    createdAt,
    updatedAt: createdAt,
    template: null,
    recipients: [
      {
        contactId: "contact_demo",
        status: CampaignRecipientStatus.PENDING,
        blockReason: null,
        createdAt
      }
    ],
    _count: { recipients: 1, messages: 0 }
  };
}

describe("public campaign transaction services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({
      created: true,
      deliveryCount: 1
    });
  });

  it("rejects a foreign or missing template before creating a draft", async () => {
    const tx = {
      messageTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
      contact: { findMany: vi.fn() },
      campaign: { create: vi.fn() },
      campaignRecipient: { deleteMany: vi.fn(), createMany: vi.fn() }
    };

    const result = await createPublicCampaign(tx as never, "org_demo", {
      name: "Launch",
      body: "Hello",
      templateId: "foreign_template",
      contactIds: ["contact_demo"]
    });

    expect(result).toEqual({ ok: false, kind: "operation_not_allowed" });
    expect(tx.messageTemplate.findFirst).toHaveBeenCalledWith({
      where: { orgId: "org_demo", id: "foreign_template" },
      select: { id: true }
    });
    expect(tx.contact.findMany).not.toHaveBeenCalled();
    expect(tx.campaign.create).not.toHaveBeenCalled();
  });

  it("schedules one preflighted database job and event in the caller transaction", async () => {
    const queueJob = {
      id: "job_demo",
      status: QueueJobStatus.QUEUED,
      runAt: scheduledAt,
      generation: 1,
      createdAt,
      updatedAt: createdAt
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      campaign: {
        findFirst: vi.fn().mockResolvedValue({
          id: "campaign_demo",
          status: CampaignStatus.DRAFT,
          recipients: [{ contactId: "contact_demo" }]
        }),
        update: vi.fn().mockResolvedValue({}),
        findFirstOrThrow: vi.fn().mockResolvedValue(campaignRow(CampaignStatus.SCHEDULED))
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "contact_demo",
            phone: "+15555550100",
            consentStatus: ConsentStatus.OPTED_IN,
            optedOutAt: null,
            archivedAt: null
          }
        ])
      },
      queueJob: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue(queueJob)
      }
    };

    const result = await schedulePublicCampaign(
      tx as never,
      "org_demo",
      "campaign_demo",
      scheduledAt
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        campaign: { id: "campaign_demo", status: CampaignStatus.SCHEDULED },
        queueJob: { id: "job_demo", status: QueueJobStatus.QUEUED }
      }
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.queueJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org_demo",
        campaignId: "campaign_demo",
        status: QueueJobStatus.QUEUED,
        runAt: scheduledAt
      })
    });
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        orgId: "org_demo",
        type: "campaign.scheduled",
        aggregateId: "campaign_demo",
        deduplicationKey: expect.stringMatching(/^api:campaign\.scheduled:[A-Za-z0-9_-]{43}$/)
      })
    );
  });

  it("does not alter queued work when a processing cancellation race is observed", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      campaign: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "campaign_demo", status: CampaignStatus.SCHEDULED })
          .mockResolvedValueOnce({
            id: "campaign_demo",
            status: CampaignStatus.SCHEDULED,
            scheduledAt
          }),
        updateMany: vi.fn()
      },
      queueJob: {
        findFirst: vi.fn().mockResolvedValue({ id: "processing_job" }),
        updateMany: vi.fn()
      }
    };

    const result = await cancelPublicCampaign(tx as never, "org_demo", "campaign_demo");

    expect(result).toEqual({ ok: false, kind: "operation_not_allowed" });
    expect(tx.queueJob.updateMany).not.toHaveBeenCalled();
    expect(tx.campaign.updateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueCustomerWebhookEvent).not.toHaveBeenCalled();
  });
});
