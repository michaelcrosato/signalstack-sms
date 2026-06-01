import { describe, expect, it } from "vitest";
import { outboundCampaignMessageIdempotencyKey, scheduledCampaignIdempotencyKey } from "@/lib/queue/idempotency";

describe("queue idempotency utilities", () => {
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
      expect(outboundCampaignMessageIdempotencyKey("org_other", "queue_job_demo", "contact_demo")).toBe(
        "dummy-outbound:org_other:queue_job_demo:contact_demo"
      );
    });

    it("handles UUIDs and special characters correctly", () => {
      expect(
        outboundCampaignMessageIdempotencyKey(
          "org_123e4567-e89b-12d3-a456-426614174000",
          "job_@#$%^&*()_+",
          "contact_demo-123"
        )
      ).toBe("dummy-outbound:org_123e4567-e89b-12d3-a456-426614174000:job_@#$%^&*()_+:contact_demo-123");
    });

    it("handles empty strings", () => {
      expect(outboundCampaignMessageIdempotencyKey("", "", "")).toBe("dummy-outbound:::");
    });
  });
});
