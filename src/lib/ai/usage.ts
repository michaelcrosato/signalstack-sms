import { UsageEventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
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

// SPEC-007: live AI reply drafts are metered as the same local AI_REQUEST event, tagged provider:"live".
export async function recordLiveAiUsage(orgId: string, endpoint: string) {
  return recordUsageEvent(orgId, {
    type: UsageEventType.AI_REQUEST,
    quantity: 1,
    metadata: {
      provider: "live",
      endpoint
    }
  });
}

export const DEFAULT_AI_DRAFT_DAILY_CAP = 100;

// Per-tenant daily cap on live AI drafts (cost guard). Invalid/absent → default. Pure.
export function aiDraftDailyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.AI_DRAFT_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_AI_DRAFT_DAILY_CAP;
}

export function aiDraftCapExceeded(
  usedInWindow: number,
  env: Record<string, string | undefined> = process.env
): boolean {
  return usedInWindow >= aiDraftDailyCap(env);
}

// Tenant-scoped count of AI_REQUEST usage events since `since` (24h window backs the live-draft cap).
export async function countAiRequestsSince(orgId: string, since: Date): Promise<number> {
  return prisma.usageEvent.count({
    where: {
      orgId,
      type: UsageEventType.AI_REQUEST,
      createdAt: { gte: since }
    }
  });
}
