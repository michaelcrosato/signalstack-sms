import { describe, expect, it } from "vitest";
import { getDeliveryMessageMetrics } from "@/lib/operations/delivery-message-metrics";

describe("getDeliveryMessageMetrics", () => {
  it("counts outbound undelivered statuses as terminal failures", () => {
    const messages = [
      {
        id: "outbound-delivered",
        direction: "OUTBOUND",
        deliveredAt: new Date("2026-05-24T20:00:00.000Z"),
        failedAt: null,
        providerStatus: "delivered"
      },
      {
        id: "outbound-undelivered",
        direction: "OUTBOUND",
        deliveredAt: null,
        failedAt: null,
        providerStatus: "undelivered"
      },
      {
        id: "outbound-failed-at",
        direction: "OUTBOUND",
        deliveredAt: null,
        failedAt: new Date("2026-05-24T20:01:00.000Z"),
        providerStatus: "sent"
      },
      {
        id: "outbound-stale-delivered-failure",
        direction: "OUTBOUND",
        deliveredAt: new Date("2026-05-24T20:02:00.000Z"),
        failedAt: null,
        providerStatus: "undelivered"
      },
      {
        id: "inbound-failed-label",
        direction: "INBOUND",
        deliveredAt: null,
        failedAt: null,
        providerStatus: "failed"
      },
      {
        id: "inbound-local",
        direction: "INBOUND",
        deliveredAt: null,
        failedAt: null,
        providerStatus: null
      }
    ];

    const metrics = getDeliveryMessageMetrics(messages);

    expect(metrics.outboundMessages.map((message) => message.id)).toEqual([
      "outbound-delivered",
      "outbound-undelivered",
      "outbound-failed-at",
      "outbound-stale-delivered-failure"
    ]);
    expect(metrics.inboundMessages.map((message) => message.id)).toEqual(["inbound-failed-label", "inbound-local"]);
    expect(metrics.deliveredMessages.map((message) => message.id)).toEqual(["outbound-delivered"]);
    expect(metrics.failedMessages.map((message) => message.id)).toEqual([
      "outbound-undelivered",
      "outbound-failed-at",
      "outbound-stale-delivered-failure"
    ]);
    expect(metrics.providerStatuses).toEqual(["delivered", "undelivered", "sent", "failed", "local_only"]);
  });
});
