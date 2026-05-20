import { UsageEventType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { aggregateUsageEvents } from "@/lib/billing/metering";

describe("analytics usage aggregation", () => {
  it("supports overview usage totals", () => {
    expect(
      aggregateUsageEvents([
        { type: UsageEventType.CONTACT_IMPORTED, quantity: 10 },
        { type: UsageEventType.CAMPAIGN_SCHEDULED, quantity: 1 }
      ])
    ).toMatchObject({
      [UsageEventType.CONTACT_IMPORTED]: 10,
      [UsageEventType.CAMPAIGN_SCHEDULED]: 1
    });
  });
});
