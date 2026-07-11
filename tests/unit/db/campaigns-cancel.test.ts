import { CampaignStatus, QueueJobStatus, QueueJobType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelCampaign } from "@/lib/db/repositories/campaigns";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignFindFirstOrThrow: vi.fn(),
  campaignUpdateMany: vi.fn(),
  queueJobFindFirst: vi.fn(),
  queueJobUpdateMany: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

describe("cancelCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) =>
      callback({
        campaign: {
          findFirst: mocks.campaignFindFirst,
          findFirstOrThrow: mocks.campaignFindFirstOrThrow,
          updateMany: mocks.campaignUpdateMany
        },
        queueJob: {
          findFirst: mocks.queueJobFindFirst,
          updateMany: mocks.queueJobUpdateMany
        }
      })
    );
    mocks.queueJobFindFirst.mockResolvedValue(null);
    mocks.campaignUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("returns null without queue mutations when the tenant campaign is missing", async () => {
    mocks.campaignFindFirst.mockResolvedValue(null);

    await expect(cancelCampaign("org_demo", "missing_campaign")).resolves.toBeNull();

    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects draft, paused, or completed campaigns without queue mutations", async () => {
    for (const status of [CampaignStatus.DRAFT, CampaignStatus.PAUSED, CampaignStatus.COMPLETED]) {
      vi.clearAllMocks();
      mocks.transaction.mockImplementation((callback) =>
        callback({
          campaign: {
            findFirst: mocks.campaignFindFirst,
            findFirstOrThrow: mocks.campaignFindFirstOrThrow,
            updateMany: mocks.campaignUpdateMany
          },
          queueJob: {
            findFirst: mocks.queueJobFindFirst,
            updateMany: mocks.queueJobUpdateMany
          }
        })
      );
      mocks.campaignFindFirst.mockResolvedValue({ id: `campaign_${status.toLowerCase()}`, status });

      await expect(cancelCampaign("org_demo", `campaign_${status.toLowerCase()}`)).rejects.toThrow(
        "Only scheduled campaigns can be canceled."
      );

      expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
      expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
    }
  });

  it("cancels queued local jobs and pauses a scheduled campaign", async () => {
    const pausedCampaign = {
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.PAUSED
    };
    mocks.campaignFindFirst.mockResolvedValue({ id: "campaign_demo", status: CampaignStatus.SCHEDULED });
    mocks.campaignFindFirstOrThrow.mockResolvedValue(pausedCampaign);

    await expect(cancelCampaign("org_demo", "campaign_demo")).resolves.toEqual(pausedCampaign);

    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_demo",
        campaignId: "campaign_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED
      },
      data: {
        status: QueueJobStatus.CANCELLED,
        processingToken: null,
        processingExpiresAt: null
      }
    });
    expect(mocks.campaignUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign_demo",
        orgId: "org_demo",
        status: CampaignStatus.SCHEDULED
      },
      data: { status: CampaignStatus.PAUSED }
    });
    expect(mocks.campaignFindFirstOrThrow).toHaveBeenCalledWith({
      where: { orgId: "org_demo", id: "campaign_demo" }
    });
    expect(mocks.queueJobUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.queueJobFindFirst.mock.invocationCallOrder[0]
    );
  });

  it("refuses cancellation once a worker owns a processing lease", async () => {
    mocks.campaignFindFirst.mockResolvedValue({ id: "campaign_demo", status: CampaignStatus.SCHEDULED });
    mocks.queueJobFindFirst.mockResolvedValue({ id: "queue_job_processing" });

    await expect(cancelCampaign("org_demo", "campaign_demo")).rejects.toThrow(
      "A processing campaign cannot be canceled."
    );

    expect(mocks.queueJobFindFirst).toHaveBeenCalledWith({
      where: {
        orgId: "org_demo",
        campaignId: "campaign_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.PROCESSING
      },
      select: { id: true }
    });
    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_demo",
        campaignId: "campaign_demo",
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED
      },
      data: {
        status: QueueJobStatus.CANCELLED,
        processingToken: null,
        processingExpiresAt: null
      }
    });
    expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
  });

  it("returns a controlled conflict when the campaign changes before the guarded pause", async () => {
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.SCHEDULED
    });
    mocks.campaignUpdateMany.mockResolvedValue({ count: 0 });

    await expect(cancelCampaign("org_demo", "campaign_demo")).rejects.toThrow(
      "Campaign cancellation conflicted with another transition."
    );

    expect(mocks.campaignFindFirstOrThrow).not.toHaveBeenCalled();
  });
});
