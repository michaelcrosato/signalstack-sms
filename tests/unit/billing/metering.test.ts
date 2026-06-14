import { UsageEventType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { aggregateUsageEvents, emptyUsageTotals, liveBillingIsBlocked } from "@/lib/billing/metering";

describe("billing metering", () => {
  it("starts with all usage totals at zero", () => {
    expect(emptyUsageTotals()).toEqual({
      [UsageEventType.CONTACT_IMPORTED]: 0,
      [UsageEventType.MESSAGE_INBOUND]: 0,
      [UsageEventType.CAMPAIGN_SCHEDULED]: 0,
      [UsageEventType.AI_REQUEST]: 0
    });
  });

  it("aggregates local usage events without billing side effects", () => {
    expect(
      aggregateUsageEvents([
        { type: UsageEventType.AI_REQUEST, quantity: 2 },
        { type: UsageEventType.AI_REQUEST, quantity: 3 },
        { type: UsageEventType.MESSAGE_INBOUND, quantity: 1 }
      ])
    ).toMatchObject({
      [UsageEventType.AI_REQUEST]: 5,
      [UsageEventType.MESSAGE_INBOUND]: 1
    });
  });

  it("blocks live billing unless the explicit flag is set", () => {
    vi.stubEnv("LIVE_BILLING_ENABLED", "false");
    expect(liveBillingIsBlocked()).toBe(true);
    vi.stubEnv("LIVE_BILLING_ENABLED", "true");
    expect(liveBillingIsBlocked()).toBe(false);
    vi.unstubAllEnvs();
  });
});
