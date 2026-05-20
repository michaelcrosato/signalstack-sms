import { describe, expect, it } from "vitest";
import { scheduledCampaignIdempotencyKey } from "@/lib/queue/idempotency";
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

  it("creates stable schedule idempotency keys", () => {
    expect(
      scheduledCampaignIdempotencyKey(
        "org_demo",
        "campaign_demo",
        new Date("2026-05-20T12:00:00.000Z")
      )
    ).toBe("scheduled-campaign:org_demo:campaign_demo:2026-05-20T12:00:00.000Z");
  });
});
