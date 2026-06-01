import { describe, expect, it } from "vitest";
import { getLocalDeliveryReviewStatus } from "@/lib/messaging/delivery-review";

describe("getLocalDeliveryReviewStatus", () => {
  it("returns 'No outbound evidence' when outboundMessages is 0", () => {
    const status = getLocalDeliveryReviewStatus({
      outboundMessages: 0,
      delivered: 0,
      pending: 0,
      failed: 0
    });
    expect(status).toBe("No outbound evidence");
  });

  it("prioritizes failures: returns failed count when failed > 0", () => {
    const status = getLocalDeliveryReviewStatus({
      outboundMessages: 10,
      delivered: 8,
      pending: 0,
      failed: 2
    });
    expect(status).toBe("2 failed; review evidence");
  });

  it("prioritizes pending after failures: returns pending count when pending > 0 and failed is 0", () => {
    const status = getLocalDeliveryReviewStatus({
      outboundMessages: 10,
      delivered: 5,
      pending: 5,
      failed: 0
    });
    expect(status).toBe("5 pending; awaiting provider status");
  });

  it("returns 'All delivered' when delivered matches outboundMessages and no failed or pending", () => {
    const status = getLocalDeliveryReviewStatus({
      outboundMessages: 10,
      delivered: 10,
      pending: 0,
      failed: 0
    });
    expect(status).toBe("All delivered");
  });

  it("returns 'Review delivery evidence' as a fallback when none of the conditions exactly match", () => {
    // e.g. outbound=10, delivered=5, pending=0, failed=0
    // This implies there are missing records or mismatch
    const status = getLocalDeliveryReviewStatus({
      outboundMessages: 10,
      delivered: 5,
      pending: 0,
      failed: 0
    });
    expect(status).toBe("Review delivery evidence");
  });
});
