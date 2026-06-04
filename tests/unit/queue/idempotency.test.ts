import { describe, expect, it } from "vitest";
import {
  scheduledCampaignIdempotencyKey,
  outboundCampaignMessageIdempotencyKey
} from "@/lib/queue/idempotency";

describe("idempotency keys", () => {
  describe("scheduledCampaignIdempotencyKey", () => {
    it("returns expected format", () => {
      const orgId = "org_123";
      const campaignId = "cmp_456";
      const scheduledAt = new Date("2024-01-01T12:00:00Z");

      expect(scheduledCampaignIdempotencyKey(orgId, campaignId, scheduledAt))
        .toBe("scheduled-campaign:org_123:cmp_456:2024-01-01T12:00:00.000Z");
    });
  });

  describe("outboundCampaignMessageIdempotencyKey", () => {
    it("returns expected format", () => {
      const orgId = "org_123";
      const queueJobId = "job_789";
      const contactId = "con_012";

      expect(outboundCampaignMessageIdempotencyKey(orgId, queueJobId, contactId))
        .toBe("dummy-outbound:org_123:job_789:con_012");
    });
  });
});
