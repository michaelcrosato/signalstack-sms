import { CampaignStatus, ConsentStatus, QueueJobStatus, QueueJobType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleCampaign } from "@/lib/db/repositories/campaigns";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignUpdate: vi.fn(),
  contactFindMany: vi.fn(),
  queueJobUpdateMany: vi.fn(),
  queueJobUpsert: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

describe("scheduleCampaign", () => {
  const scheduledAt = new Date("2026-05-24T18:00:00.000Z");
  const idempotencyKey = "scheduled-campaign:org_demo:campaign_demo:2026-05-24T18:00:00.000Z";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) =>
      callback({
        campaign: {
          findFirst: mocks.campaignFindFirst,
          update: mocks.campaignUpdate
        },
        contact: {
          findMany: mocks.contactFindMany
        },
        queueJob: {
          updateMany: mocks.queueJobUpdateMany,
          upsert: mocks.queueJobUpsert
        }
      })
    );
  });

  it("returns null without queue mutations when the tenant campaign is missing", async () => {
    mocks.campaignFindFirst.mockResolvedValue(null);

    await expect(scheduleCampaign("org_demo", "missing_campaign", scheduledAt)).resolves.toBeNull();

    expect(mocks.contactFindMany).not.toHaveBeenCalled();
    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queueJobUpsert).not.toHaveBeenCalled();
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
  });

  it("rejects non-schedulable campaigns without contact or queue mutations", async () => {
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.COMPLETED,
      recipients: [{ contactId: "contact_allowed" }]
    });

    await expect(scheduleCampaign("org_demo", "campaign_demo", scheduledAt)).rejects.toThrow(
      "Only draft or paused campaigns can be scheduled."
    );

    expect(mocks.contactFindMany).not.toHaveBeenCalled();
    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queueJobUpsert).not.toHaveBeenCalled();
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
  });

  it("cancels stale queued jobs before upserting the active schedule", async () => {
    const queueJob = {
      id: "queue_job_demo",
      orgId: "org_demo",
      campaignId: "campaign_demo",
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: QueueJobStatus.QUEUED,
      idempotencyKey,
      payload: {
        version: 1,
        orgId: "org_demo",
        campaignId: "campaign_demo",
        scheduledAt: scheduledAt.toISOString()
      },
      runAt: scheduledAt
    };

    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.PAUSED,
      recipients: [{ contactId: "contact_allowed" }]
    });
    mocks.contactFindMany.mockResolvedValue([
      {
        id: "contact_allowed",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null
      }
    ]);
    mocks.queueJobUpsert.mockResolvedValue(queueJob);

    await expect(scheduleCampaign("org_demo", "campaign_demo", scheduledAt)).resolves.toEqual(queueJob);

    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_demo",
        campaignId: "campaign_demo",
        status: QueueJobStatus.QUEUED,
        idempotencyKey: { not: idempotencyKey }
      },
      data: { status: QueueJobStatus.CANCELLED }
    });
    expect(mocks.campaignUpdate).toHaveBeenCalledWith({
      where: { id: "campaign_demo" },
      data: { status: CampaignStatus.SCHEDULED, scheduledAt }
    });
    expect(mocks.queueJobUpsert).toHaveBeenCalledWith({
      where: { orgId_idempotencyKey: { orgId: "org_demo", idempotencyKey } },
      update: {
        status: QueueJobStatus.QUEUED,
        payload: queueJob.payload,
        runAt: scheduledAt
      },
      create: {
        orgId: "org_demo",
        campaignId: "campaign_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED,
        idempotencyKey,
        payload: queueJob.payload,
        runAt: scheduledAt
      }
    });
    expect(mocks.queueJobUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.queueJobUpsert.mock.invocationCallOrder[0]
    );
  });

  it("rejects failed preflight without cancelling or creating queue jobs", async () => {
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.DRAFT,
      recipients: [{ contactId: "contact_blocked" }]
    });
    mocks.contactFindMany.mockResolvedValue([
      {
        id: "contact_blocked",
        phone: "+15555550101",
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: new Date("2026-05-24T17:00:00.000Z"),
        archivedAt: null
      }
    ]);

    await expect(scheduleCampaign("org_demo", "campaign_demo", scheduledAt)).rejects.toThrow(
      "Campaign preflight failed."
    );

    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queueJobUpsert).not.toHaveBeenCalled();
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
  });
});
