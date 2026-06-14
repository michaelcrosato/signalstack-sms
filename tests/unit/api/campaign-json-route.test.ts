import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/campaigns/route";
import { PATCH } from "@/app/api/campaigns/[campaignId]/route";

const mocks = vi.hoisted(() => ({
  createCampaign: vi.fn(),
  getCampaign: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  listCampaigns: vi.fn(),
  requireApiRole: vi.fn(),
  updateCampaign: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/db/repositories/campaigns", () => ({
  createCampaign: mocks.createCampaign,
  getCampaign: mocks.getCampaign,
  listCampaigns: mocks.listCampaigns,
  updateCampaign: mocks.updateCampaign
}));

describe("campaign JSON mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("rejects malformed create JSON without creating a local campaign", async () => {
    const response = await POST(
      new Request("http://localhost/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid campaign payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });

  it("rejects malformed update JSON without updating a tenant campaign", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/campaigns/campaign_demo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{"
      }),
      { params: Promise.resolve({ campaignId: "campaign_demo" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid campaign payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
  });
});
