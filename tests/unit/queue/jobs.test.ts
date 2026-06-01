import { describe, expect, it } from "vitest";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";

describe("queue job contracts", () => {
  it("validates scheduled campaign jobs", () => {
    expect(
      scheduledCampaignJobSchema.parse({
        version: 1,
        orgId: "org_demo",
        campaignId: "campaign_demo",
        scheduledAt: "2026-05-20T12:00:00.000Z"
      })
    ).toMatchObject({ version: 1, orgId: "org_demo" });
  });
});
