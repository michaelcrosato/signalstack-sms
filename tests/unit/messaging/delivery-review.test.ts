import { describe, expect, it } from "vitest";
import { getLocalDeliveryReviewStatus } from "@/lib/messaging/delivery-review";

describe("getLocalDeliveryReviewStatus", () => {
  it("returns 'No outbound evidence' when there are no outbound messages", () => {
    expect(
      getLocalDeliveryReviewStatus({
        outboundMessages: 0,
        delivered: 0,
        pending: 0,
        failed: 0
      })
    ).toBe("No outbound evidence");
  });

  it("returns failed count when there are failed messages", () => {
    expect(
      getLocalDeliveryReviewStatus({
        outboundMessages: 10,
        delivered: 5,
        pending: 3,
        failed: 2
      })
    ).toBe("2 failed; review evidence");
  });

  it("returns pending count when there are pending messages and no failed messages", () => {
    expect(
      getLocalDeliveryReviewStatus({
        outboundMessages: 10,
        delivered: 7,
        pending: 3,
        failed: 0
      })
    ).toBe("3 pending; awaiting provider status");
  });

  it("returns 'All delivered' when delivered matches outbound messages and no pending or failed", () => {
    expect(
      getLocalDeliveryReviewStatus({
        outboundMessages: 10,
        delivered: 10,
        pending: 0,
        failed: 0
      })
    ).toBe("All delivered");
  });

  it("returns 'Review delivery evidence' when counts do not add up cleanly", () => {
    // E.g. outboundMessages: 10, delivered: 5, pending: 0, failed: 0
    expect(
      getLocalDeliveryReviewStatus({
        outboundMessages: 10,
        delivered: 5,
        pending: 0,
        failed: 0
      })
    ).toBe("Review delivery evidence");
  });
});
