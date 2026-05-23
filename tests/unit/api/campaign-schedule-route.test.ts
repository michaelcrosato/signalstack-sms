import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/campaigns/[campaignId]/schedule/route";

const mocks = vi.hoisted(() => ({
  enqueueScheduledCampaignBullMqJob: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  requireApiRole: vi.fn(),
  scheduleCampaign: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/db/repositories/campaigns", () => ({
  scheduleCampaign: mocks.scheduleCampaign
}));

vi.mock("@/lib/queue/bullmq", () => ({
  enqueueScheduledCampaignBullMqJob: mocks.enqueueScheduledCampaignBullMqJob
}));

describe("campaign schedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("rejects malformed JSON without scheduling or enqueueing work", async () => {
    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign_demo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      }),
      { params: Promise.resolve({ campaignId: "campaign_demo" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid schedule payload.", issues: [] });
    expect(mocks.scheduleCampaign).not.toHaveBeenCalled();
    expect(mocks.enqueueScheduledCampaignBullMqJob).not.toHaveBeenCalled();
  });
});
