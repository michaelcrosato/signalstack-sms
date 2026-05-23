import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/campaigns/[campaignId]/cancel/route";

const mocks = vi.hoisted(() => ({
  cancelCampaign: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  requireApiRole: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/db/repositories/campaigns", () => ({
  cancelCampaign: mocks.cancelCampaign
}));

describe("campaign cancel route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("returns role denials before canceling queued local work", async () => {
    mocks.requireApiRole.mockReturnValue(new Response(JSON.stringify({ error: "Forbidden." }), { status: 403 }));

    const response = await POST(new Request("http://localhost/api/campaigns/campaign_demo/cancel", { method: "POST" }), {
      params: Promise.resolve({ campaignId: "campaign_demo" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
    expect(mocks.cancelCampaign).not.toHaveBeenCalled();
  });

  it("returns not found when no tenant-scoped campaign can be canceled", async () => {
    mocks.cancelCampaign.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/campaigns/missing_campaign/cancel", { method: "POST" }), {
      params: Promise.resolve({ campaignId: "missing_campaign" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Campaign not found." });
    expect(mocks.cancelCampaign).toHaveBeenCalledWith("org_demo", "missing_campaign");
  });

  it("returns conflict when an existing campaign is not scheduled", async () => {
    mocks.cancelCampaign.mockRejectedValue(new Error("Only scheduled campaigns can be canceled."));

    const response = await POST(new Request("http://localhost/api/campaigns/campaign_draft/cancel", { method: "POST" }), {
      params: Promise.resolve({ campaignId: "campaign_draft" })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Only scheduled campaigns can be canceled." });
    expect(mocks.cancelCampaign).toHaveBeenCalledWith("org_demo", "campaign_draft");
  });

  it("returns the locally paused campaign after canceling queued jobs", async () => {
    const campaign = {
      id: "campaign_demo",
      orgId: "org_demo",
      name: "May promo",
      status: "PAUSED",
      scheduledAt: new Date("2026-05-23T18:00:00.000Z")
    };
    mocks.cancelCampaign.mockResolvedValue(campaign);

    const response = await POST(new Request("http://localhost/api/campaigns/campaign_demo/cancel", { method: "POST" }), {
      params: Promise.resolve({ campaignId: "campaign_demo" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      campaign: {
        ...campaign,
        scheduledAt: "2026-05-23T18:00:00.000Z"
      }
    });
    expect(mocks.cancelCampaign).toHaveBeenCalledWith("org_demo", "campaign_demo");
  });
});
