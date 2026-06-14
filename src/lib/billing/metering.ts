import { BillingAccountStatus, UsageEventType, type Prisma, type UsageEvent } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { UsageEventCreateInput } from "@/lib/validation/billing";

export type UsageTotals = Record<UsageEventType, number>;

export function liveBillingIsBlocked() {
  return process.env.LIVE_BILLING_ENABLED !== "true";
}

export function emptyUsageTotals(): UsageTotals {
  return {
    [UsageEventType.CONTACT_IMPORTED]: 0,
    [UsageEventType.MESSAGE_INBOUND]: 0,
    [UsageEventType.CAMPAIGN_SCHEDULED]: 0,
    [UsageEventType.AI_REQUEST]: 0
  };
}

export function aggregateUsageEvents(events: Array<Pick<UsageEvent, "type" | "quantity">>): UsageTotals {
  const totals = emptyUsageTotals();

  for (const event of events) {
    totals[event.type] += event.quantity;
  }

  return totals;
}

export async function getOrCreateBillingAccount(orgId: string) {
  return prisma.billingAccount.upsert({
    where: { orgId },
    update: {
      liveBillingEnabled: false
    },
    create: {
      orgId,
      status: BillingAccountStatus.DEMO,
      liveBillingEnabled: false
    }
  });
}

export async function recordUsageEvent(orgId: string, input: UsageEventCreateInput) {
  return prisma.usageEvent.create({
    data: {
      orgId,
      type: input.type,
      quantity: input.quantity,
      metadata: input.metadata as Prisma.InputJsonObject | undefined
    }
  });
}

export async function getUsageSummary(orgId: string) {
  const [billingAccount, events] = await Promise.all([
    getOrCreateBillingAccount(orgId),
    prisma.usageEvent.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  return {
    billingAccount,
    liveBillingBlocked: liveBillingIsBlocked(),
    totals: aggregateUsageEvents(events),
    recentEvents: events
  };
}
