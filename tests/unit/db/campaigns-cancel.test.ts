import { CampaignStatus, QueueJobStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelCampaign } from "@/lib/db/repositories/campaigns";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignUpdate: vi.fn(),
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
          update: mocks.campaignUpdate
        },
        queueJob: {
          updateMany: mocks.queueJobUpdateMany
        }
      })
    );
  });

  it("returns null without queue mutations when the tenant campaign is missing", async () => {
    mocks.campaignFindFirst.mockResolvedValue(null);

    await expect(cancelCampaign("org_demo", "missing_campaign")).resolves.toBeNull();

    expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
  });

  it("does not pause draft or completed campaigns", async () => {
    for (const status of [CampaignStatus.DRAFT, CampaignStatus.PAUSED, CampaignStatus.COMPLETED]) {
      vi.clearAllMocks();
      mocks.transaction.mockImplementation((callback) =>
        callback({
          campaign: {
            findFirst: mocks.campaignFindFirst,
            update: mocks.campaignUpdate
          },
          queueJob: {
            updateMany: mocks.queueJobUpdateMany
          }
        })
      );
      mocks.campaignFindFirst.mockResolvedValue({ id: `campaign_${status.toLowerCase()}`, status });

      await expect(cancelCampaign("org_demo", `campaign_${status.toLowerCase()}`)).resolves.toBeNull();

      expect(mocks.queueJobUpdateMany).not.toHaveBeenCalled();
      expect(mocks.campaignUpdate).not.toHaveBeenCalled();
    }
  });

  it("cancels queued local jobs and pauses a scheduled campaign", async () => {
    const pausedCampaign = {
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.PAUSED
    };
    mocks.campaignFindFirst.mockResolvedValue({ id: "campaign_demo", status: CampaignStatus.SCHEDULED });
    mocks.campaignUpdate.mockResolvedValue(pausedCampaign);

    await expect(cancelCampaign("org_demo", "campaign_demo")).resolves.toEqual(pausedCampaign);

    expect(mocks.queueJobUpdateMany).toHaveBeenCalledWith({
      where: { orgId: "org_demo", campaignId: "campaign_demo", status: QueueJobStatus.QUEUED },
      data: { status: QueueJobStatus.CANCELLED }
    });
    expect(mocks.campaignUpdate).toHaveBeenCalledWith({
      where: { id: "campaign_demo" },
      data: { status: CampaignStatus.PAUSED }
    });
  });
});
