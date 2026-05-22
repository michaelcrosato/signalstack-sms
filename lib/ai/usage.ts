import { UsageEventType } from "@prisma/client";
import { recordUsageEvent } from "@/lib/billing/metering";

export async function recordFakeAiUsage(orgId: string, endpoint: string) {
  return recordUsageEvent(orgId, {
    type: UsageEventType.AI_REQUEST,
    quantity: 1,
    metadata: {
      provider: "fake",
      endpoint
    }
  });
}
