import { describe, expect, it } from "vitest";
import {
  outboundDeliveredMessageWhere,
  outboundAmbiguousMessageWhere,
  outboundFailedMessageWhere,
  outboundMessageWhere,
  outboundPendingMessageWhere
} from "@/lib/messaging/delivery-counts";

describe("delivery count query helpers", () => {
  it("keeps outbound delivery buckets mutually exclusive for local reporting", () => {
    expect(outboundMessageWhere("org_demo")).toEqual({
      orgId: "org_demo",
      direction: "OUTBOUND"
    });
    expect(outboundDeliveredMessageWhere("org_demo")).toEqual({
      orgId: "org_demo",
      direction: "OUTBOUND",
      applicationStatus: "DELIVERED"
    });
    expect(outboundPendingMessageWhere("org_demo")).toEqual({
      orgId: "org_demo",
      direction: "OUTBOUND",
      applicationStatus: { in: ["ACCEPTED", "SCHEDULED", "PROCESSING", "SENT"] }
    });
    expect(outboundFailedMessageWhere("org_demo")).toEqual({
      orgId: "org_demo",
      direction: "OUTBOUND",
      applicationStatus: "FAILED"
    });
    expect(outboundAmbiguousMessageWhere("org_demo")).toEqual({
      orgId: "org_demo",
      direction: "OUTBOUND",
      applicationStatus: "AMBIGUOUS"
    });
  });

  it("returns fresh pending-state arrays so callers cannot mutate later counts", () => {
    const pendingWhere = outboundPendingMessageWhere("org_demo");
    const pendingStatuses = (pendingWhere.applicationStatus as { in: string[] }).in;
    pendingStatuses.push("AMBIGUOUS");
    expect((outboundPendingMessageWhere("org_demo").applicationStatus as { in: string[] }).in)
      .toEqual(["ACCEPTED", "SCHEDULED", "PROCESSING", "SENT"]);
  });
});
