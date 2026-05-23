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

  it("returns role denials before parsing request bodies or scheduling work", async () => {
    mocks.requireApiRole.mockReturnValue(new Response(JSON.stringify({ error: "Forbidden." }), { status: 403 }));

    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign_demo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      }),
      { params: Promise.resolve({ campaignId: "campaign_demo" }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
    expect(mocks.scheduleCampaign).not.toHaveBeenCalled();
    expect(mocks.enqueueScheduledCampaignBullMqJob).not.toHaveBeenCalled();
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

  it("rejects schema-invalid JSON without scheduling or enqueueing work", async () => {
    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign_demo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: "tomorrow" })
      }),
      { params: Promise.resolve({ campaignId: "campaign_demo" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid schedule payload.",
      issues: [expect.objectContaining({ path: ["scheduledAt"] })]
    });
    expect(mocks.scheduleCampaign).not.toHaveBeenCalled();
    expect(mocks.enqueueScheduledCampaignBullMqJob).not.toHaveBeenCalled();
  });

  it("returns not found without enqueueing BullMQ work when no campaign is scheduled", async () => {
    mocks.scheduleCampaign.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/campaigns/missing_campaign/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: "2026-05-23T18:00:00.000Z" })
      }),
      { params: Promise.resolve({ campaignId: "missing_campaign" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Campaign not found." });
    expect(mocks.scheduleCampaign).toHaveBeenCalledWith(
      "org_demo",
      "missing_campaign",
      new Date("2026-05-23T18:00:00.000Z")
    );
    expect(mocks.enqueueScheduledCampaignBullMqJob).not.toHaveBeenCalled();
  });

  it("returns the persisted queue job and enqueues optional BullMQ work after a valid schedule", async () => {
    const queueJob = {
      id: "queue_job_demo",
      idempotencyKey: "scheduled-campaign:org_demo:campaign_demo:2026-05-23T18:00:00.000Z",
      payload: {
        version: 1,
        orgId: "org_demo",
        campaignId: "campaign_demo",
        scheduledAt: "2026-05-23T18:00:00.000Z"
      },
      runAt: new Date("2026-05-23T18:00:00.000Z")
    };
    mocks.scheduleCampaign.mockResolvedValue(queueJob);
    mocks.enqueueScheduledCampaignBullMqJob.mockResolvedValue({ enqueued: false, reason: "backend-disabled" });

    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign_demo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: "2026-05-23T18:00:00.000Z" })
      }),
      { params: Promise.resolve({ campaignId: "campaign_demo" }) }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      queueJob: {
        ...queueJob,
        runAt: "2026-05-23T18:00:00.000Z"
      }
    });
    expect(mocks.scheduleCampaign).toHaveBeenCalledWith(
      "org_demo",
      "campaign_demo",
      new Date("2026-05-23T18:00:00.000Z")
    );
    expect(mocks.enqueueScheduledCampaignBullMqJob).toHaveBeenCalledWith(queueJob);
    expect(mocks.scheduleCampaign.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueueScheduledCampaignBullMqJob.mock.invocationCallOrder[0]
    );
  });
});
