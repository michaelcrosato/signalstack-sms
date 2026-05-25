import { describe, expect, it } from "vitest";
import {
  outboundDeliveredMessageWhere,
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
      deliveredAt: { not: null },
      failedAt: null,
      OR: [{ providerStatus: null }, { providerStatus: { notIn: ["failed", "undelivered"] } }]
    });
    expect(outboundPendingMessageWhere("org_demo")).toEqual({
      orgId: "org_demo",
      direction: "OUTBOUND",
      deliveredAt: null,
      failedAt: null,
      OR: [{ providerStatus: null }, { providerStatus: { notIn: ["failed", "undelivered"] } }]
    });
    expect(outboundFailedMessageWhere("org_demo")).toEqual({
      orgId: "org_demo",
      direction: "OUTBOUND",
      OR: [{ failedAt: { not: null } }, { providerStatus: { in: ["failed", "undelivered"] } }]
    });
  });

  it("returns fresh provider-status arrays so callers cannot mutate later counts", () => {
    const deliveredWhere = outboundDeliveredMessageWhere("org_demo");
    const pendingWhere = outboundPendingMessageWhere("org_demo");
    const failedWhere = outboundFailedMessageWhere("org_demo");

    const deliveredStatuses = (deliveredWhere.OR?.[1] as { providerStatus: { notIn: string[] } }).providerStatus.notIn;
    const pendingStatuses = (pendingWhere.OR?.[1] as { providerStatus: { notIn: string[] } }).providerStatus.notIn;
    const failedStatuses = (failedWhere.OR?.[1] as { providerStatus: { in: string[] } }).providerStatus.in;

    expect(deliveredStatuses).not.toBe(pendingStatuses);
    expect(deliveredStatuses).not.toBe(failedStatuses);

    deliveredStatuses.push("caller-mutated");

    expect(outboundDeliveredMessageWhere("org_demo")).toMatchObject({
      OR: [{ providerStatus: null }, { providerStatus: { notIn: ["failed", "undelivered"] } }]
    });
    expect(outboundPendingMessageWhere("org_demo")).toMatchObject({
      OR: [{ providerStatus: null }, { providerStatus: { notIn: ["failed", "undelivered"] } }]
    });
    expect(outboundFailedMessageWhere("org_demo")).toMatchObject({
      OR: [{ failedAt: { not: null } }, { providerStatus: { in: ["failed", "undelivered"] } }]
    });
  });
});
