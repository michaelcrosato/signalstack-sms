import { randomUUID } from "node:crypto";
import { withWorkerDispatchTransaction } from "@/lib/db/tenant-context";
import { QUEUE_JOB_PROCESSING_LEASE_MS } from "@/lib/queue/claim-lease";

type QueueDispatchRow = Readonly<{
  id: string;
  orgId: string;
}>;

export type ScheduledCampaignQueueJobClaim = Readonly<{
  queueJobId: string;
  expectedOrgId: string;
  processingToken: string;
  processingExpiresAt: Date;
}>;

/**
 * Atomically claim due jobs through the worker role's single reviewed SECURITY DEFINER capability.
 * The function returns only authoritative row identity; payload and tenant data remain inaccessible
 * until the caller enters the returned organization through `withTenantTransaction`.
 */
export async function claimDueScheduledCampaignQueueJobs(
  now: Date,
  maxJobs: number
): Promise<readonly ScheduledCampaignQueueJobClaim[]> {
  const boundedMaxJobs = Math.min(100, Math.max(1, Math.trunc(maxJobs)));
  const processingToken = randomUUID();
  const processingExpiresAt = new Date(now.getTime() + QUEUE_JOB_PROCESSING_LEASE_MS);

  const rows = await withWorkerDispatchTransaction((tx) => tx.$queryRaw<QueueDispatchRow[]>`
    SELECT claimed.id, claimed."orgId"
    FROM public.claim_due_queue_jobs(
      ${boundedMaxJobs}::integer,
      ${now}::timestamptz,
      ${QUEUE_JOB_PROCESSING_LEASE_MS}::integer,
      ${processingToken}::uuid
    ) AS claimed
  `);

  if (rows.length > boundedMaxJobs) {
    throw new Error("Worker dispatch returned too many queue jobs.");
  }

  const identities = new Set<string>();
  return Object.freeze(rows.map((row) => {
    if (
      typeof row.id !== "string" ||
      row.id.length < 1 ||
      typeof row.orgId !== "string" ||
      row.orgId.length < 1
    ) {
      throw new Error("Worker dispatch returned an invalid queue job identity.");
    }
    const identity = `${row.orgId}\u0000${row.id}`;
    if (identities.has(identity)) {
      throw new Error("Worker dispatch returned a duplicate queue job identity.");
    }
    identities.add(identity);
    return Object.freeze({
      queueJobId: row.id,
      expectedOrgId: row.orgId,
      processingToken,
      processingExpiresAt
    });
  }));
}
