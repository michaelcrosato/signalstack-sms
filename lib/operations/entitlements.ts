import type { Prisma } from "@prisma/client";

export type PlanTier = "community" | "starter" | "pro" | "enterprise";

export type PlanQuotaLimits = {
  readonly maxContacts: number;
  readonly maxMonthlyMessageSegments: number;
  readonly maxApiKeys: number;
  readonly maxSeats: number;
  readonly maxMediaStorageBytes: number;
};

export const PLAN_QUOTAS: Record<PlanTier, PlanQuotaLimits> = Object.freeze({
  community: Object.freeze({
    maxContacts: 100,
    maxMonthlyMessageSegments: 500,
    maxApiKeys: 2,
    maxSeats: 3,
    maxMediaStorageBytes: 100 * 1024 * 1024 // 100 MB
  }),
  starter: Object.freeze({
    maxContacts: 1_000,
    maxMonthlyMessageSegments: 5_000,
    maxApiKeys: 5,
    maxSeats: 10,
    maxMediaStorageBytes: 500 * 1024 * 1024 // 500 MB
  }),
  pro: Object.freeze({
    maxContacts: 10_000,
    maxMonthlyMessageSegments: 50_000,
    maxApiKeys: 20,
    maxSeats: 25,
    maxMediaStorageBytes: 5 * 1024 * 1024 * 1024 // 5 GB
  }),
  enterprise: Object.freeze({
    maxContacts: 1_000_000,
    maxMonthlyMessageSegments: 1_000_000,
    maxApiKeys: 100,
    maxSeats: 100,
    maxMediaStorageBytes: 50 * 1024 * 1024 * 1024 // 50 GB
  })
});

export const DEFAULT_PLAN_TIER: PlanTier = "starter";

export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED";
  readonly metric: "contacts" | "monthly_segments" | "api_keys" | "seats" | "media_storage";
  readonly current: number;
  readonly limit: number;

  constructor(
    metric: QuotaExceededError["metric"],
    current: number,
    limit: number,
    message?: string
  ) {
    super(message ?? `Plan quota exceeded for ${metric}: ${current}/${limit}`);
    this.name = "QuotaExceededError";
    this.metric = metric;
    this.current = current;
    this.limit = limit;
  }
}

export function getPlanLimits(planTier: PlanTier | string = DEFAULT_PLAN_TIER): PlanQuotaLimits {
  const normalizedTier = (planTier.toLowerCase() in PLAN_QUOTAS
    ? planTier.toLowerCase()
    : DEFAULT_PLAN_TIER) as PlanTier;
  return PLAN_QUOTAS[normalizedTier];
}

export type QuotaCheckResult = Readonly<{
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}>;

export function checkContactQuota(
  currentCount: number,
  additionalCount: number = 1,
  limits: PlanQuotaLimits = getPlanLimits()
): QuotaCheckResult {
  const limit = limits.maxContacts;
  const nextTotal = currentCount + additionalCount;
  const allowed = nextTotal <= limit;
  const remaining = Math.max(0, limit - currentCount);
  return Object.freeze({ allowed, current: currentCount, limit, remaining });
}

export function checkMessageSegmentQuota(
  currentMonthlySegments: number,
  additionalSegments: number = 1,
  limits: PlanQuotaLimits = getPlanLimits()
): QuotaCheckResult {
  const limit = limits.maxMonthlyMessageSegments;
  const nextTotal = currentMonthlySegments + additionalSegments;
  const allowed = nextTotal <= limit;
  const remaining = Math.max(0, limit - currentMonthlySegments);
  return Object.freeze({ allowed, current: currentMonthlySegments, limit, remaining });
}

export function checkApiKeyQuota(
  currentCount: number,
  additionalCount: number = 1,
  limits: PlanQuotaLimits = getPlanLimits()
): QuotaCheckResult {
  const limit = limits.maxApiKeys;
  const nextTotal = currentCount + additionalCount;
  const allowed = nextTotal <= limit;
  const remaining = Math.max(0, limit - currentCount);
  return Object.freeze({ allowed, current: currentCount, limit, remaining });
}

export function checkSeatQuota(
  currentCount: number,
  additionalCount: number = 1,
  limits: PlanQuotaLimits = getPlanLimits()
): QuotaCheckResult {
  const limit = limits.maxSeats;
  const nextTotal = currentCount + additionalCount;
  const allowed = nextTotal <= limit;
  const remaining = Math.max(0, limit - currentCount);
  return Object.freeze({ allowed, current: currentCount, limit, remaining });
}

export function checkMediaStorageQuota(
  currentBytes: number,
  additionalBytes: number = 0,
  limits: PlanQuotaLimits = getPlanLimits()
): QuotaCheckResult {
  const limit = limits.maxMediaStorageBytes;
  const nextTotal = currentBytes + additionalBytes;
  const allowed = nextTotal <= limit;
  const remaining = Math.max(0, limit - currentBytes);
  return Object.freeze({ allowed, current: currentBytes, limit, remaining });
}

export async function enforceContactQuota(
  tx: Prisma.TransactionClient,
  orgId: string,
  additionalCount: number = 1,
  planTier: PlanTier = DEFAULT_PLAN_TIER
): Promise<QuotaCheckResult> {
  if (typeof tx.contact?.count !== "function") {
    return Object.freeze({ allowed: true, current: 0, limit: Infinity, remaining: Infinity });
  }
  const currentCount = await tx.contact.count({ where: { orgId, archivedAt: null } });
  const limits = getPlanLimits(planTier);
  const result = checkContactQuota(currentCount, additionalCount, limits);
  if (!result.allowed) {
    throw new QuotaExceededError("contacts", currentCount, result.limit);
  }
  return result;
}

export async function enforceMessageSegmentQuota(
  tx: Prisma.TransactionClient,
  orgId: string,
  additionalSegments: number = 1,
  planTier: PlanTier = DEFAULT_PLAN_TIER
): Promise<QuotaCheckResult> {
  if (typeof tx.message?.count !== "function") {
    return Object.freeze({ allowed: true, current: 0, limit: Infinity, remaining: Infinity });
  }
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentMonthlyMessages = await tx.message.count({
    where: {
      orgId,
      direction: "OUTBOUND",
      createdAt: { gte: startOfMonth }
    }
  });
  const limits = getPlanLimits(planTier);
  const result = checkMessageSegmentQuota(currentMonthlyMessages, additionalSegments, limits);
  if (!result.allowed) {
    throw new QuotaExceededError("monthly_segments", currentMonthlyMessages, result.limit);
  }
  return result;
}

export async function enforceApiKeyQuota(
  tx: Prisma.TransactionClient,
  orgId: string,
  additionalCount: number = 1,
  planTier: PlanTier = DEFAULT_PLAN_TIER
): Promise<QuotaCheckResult> {
  if (typeof tx.apiCredential?.count !== "function") {
    return Object.freeze({ allowed: true, current: 0, limit: Infinity, remaining: Infinity });
  }
  const currentCount = await tx.apiCredential.count({ where: { orgId, revokedAt: null } });
  const limits = getPlanLimits(planTier);
  const result = checkApiKeyQuota(currentCount, additionalCount, limits);
  if (!result.allowed) {
    throw new QuotaExceededError("api_keys", currentCount, result.limit);
  }
  return result;
}

export async function enforceSeatQuota(
  tx: Prisma.TransactionClient,
  orgId: string,
  additionalCount: number = 1,
  planTier: PlanTier = DEFAULT_PLAN_TIER
): Promise<QuotaCheckResult> {
  if (typeof tx.membership?.count !== "function") {
    return Object.freeze({ allowed: true, current: 0, limit: Infinity, remaining: Infinity });
  }
  const activeMemberships = await tx.membership.count({
    where: { orgId, status: { in: ["ACTIVE", "INVITED"] } }
  });
  const pendingInvites =
    typeof tx.authToken?.count === "function"
      ? await tx.authToken.count({
          where: {
            orgId,
            type: "INVITE",
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() }
          }
        })
      : 0;
  const currentTotalSeats = activeMemberships + pendingInvites;
  const limits = getPlanLimits(planTier);
  const result = checkSeatQuota(currentTotalSeats, additionalCount, limits);
  if (!result.allowed) {
    throw new QuotaExceededError("seats", currentTotalSeats, result.limit);
  }
  return result;
}
