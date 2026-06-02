import { describe, expect, it } from "vitest";
import { outboundCampaignMessageIdempotencyKey, scheduledCampaignIdempotencyKey } from "@/lib/queue/idempotency";

describe("queue job idempotency keys", () => {
  describe("scheduledCampaignIdempotencyKey", () => {
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

  describe("outboundCampaignMessageIdempotencyKey", () => {
    it("creates tenant-explicit outbound message idempotency keys", () => {
      expect(outboundCampaignMessageIdempotencyKey("org_demo", "queue_job_demo", "contact_demo")).toBe(
        "dummy-outbound:org_demo:queue_job_demo:contact_demo"
      );
    });

    it("differentiates based on orgId", () => {
      expect(outboundCampaignMessageIdempotencyKey("org_other", "queue_job_demo", "contact_demo")).toBe(
        "dummy-outbound:org_other:queue_job_demo:contact_demo"
      );
    });

    it("differentiates based on queueJobId", () => {
      expect(outboundCampaignMessageIdempotencyKey("org_demo", "queue_job_other", "contact_demo")).toBe(
        "dummy-outbound:org_demo:queue_job_other:contact_demo"
      );
    });

    it("differentiates based on contactId", () => {
      expect(outboundCampaignMessageIdempotencyKey("org_demo", "queue_job_demo", "contact_other")).toBe(
        "dummy-outbound:org_demo:queue_job_demo:contact_other"
      );
    });
  });
});
