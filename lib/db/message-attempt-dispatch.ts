import { randomUUID } from "node:crypto";
import { withWorkerDispatchTransaction } from "@/lib/db/tenant-context";

export const MESSAGE_ATTEMPT_PROCESSING_LEASE_MS = 30_000;

type MessageAttemptDispatchRow = Readonly<{
  attemptId: string;
  orgId: string;
}>;

export type MessageAttemptClaim = Readonly<{
  attemptId: string;
  expectedOrgId: string;
  processingToken: string;
  processingExpiresAt: Date;
}>;

export type RecoveredMessageAttempt = Readonly<{
  attemptId: string;
  expectedOrgId: string;
}>;

export async function claimDueMessageAttempts(
  maxAttempts = 25,
  dependencies: Readonly<{
    processingToken?: string;
    now?: () => Date;
  }> = {}
): Promise<readonly MessageAttemptClaim[]> {
  const bounded = boundedBatchSize(maxAttempts);
  const processingToken = dependencies.processingToken ?? randomUUID();
  assertUuid(processingToken);
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Message-attempt dispatch clock is invalid.");
  const rows = await withWorkerDispatchTransaction((tx) => tx.$queryRaw<MessageAttemptDispatchRow[]>`
    SELECT claimed."attemptId", claimed."orgId"
    FROM public.claim_due_message_attempts(
      ${bounded}::integer,
      ${MESSAGE_ATTEMPT_PROCESSING_LEASE_MS}::integer,
      ${processingToken}::uuid
    ) AS claimed
  `);
  return Object.freeze(validateRows(rows, bounded).map((row) => Object.freeze({
    attemptId: row.attemptId,
    expectedOrgId: row.orgId,
    processingToken,
    processingExpiresAt: new Date(now.getTime() + MESSAGE_ATTEMPT_PROCESSING_LEASE_MS)
  })));
}

export async function recoverExpiredMessageAttempts(
  maxAttempts = 25
): Promise<readonly RecoveredMessageAttempt[]> {
  const bounded = boundedBatchSize(maxAttempts);
  const rows = await withWorkerDispatchTransaction((tx) => tx.$queryRaw<MessageAttemptDispatchRow[]>`
    SELECT recovered."attemptId", recovered."orgId"
    FROM public.recover_expired_message_attempts(${bounded}::integer) AS recovered
  `);
  return Object.freeze(validateRows(rows, bounded).map((row) => Object.freeze({
    attemptId: row.attemptId,
    expectedOrgId: row.orgId
  })));
}

function validateRows(
  rows: readonly MessageAttemptDispatchRow[],
  maximum: number
): readonly MessageAttemptDispatchRow[] {
  if (!Array.isArray(rows) || rows.length > maximum) {
    throw new Error("Message-attempt dispatch returned too many rows.");
  }
  const identities = new Set<string>();
  for (const row of rows) {
    if (
      !row ||
      typeof row.attemptId !== "string" ||
      row.attemptId.length < 1 ||
      row.attemptId.length > 191 ||
      typeof row.orgId !== "string" ||
      row.orgId.length < 1 ||
      row.orgId.length > 191
    ) {
      throw new Error("Message-attempt dispatch returned an invalid identity.");
    }
    const identity = `${row.orgId}\0${row.attemptId}`;
    if (identities.has(identity)) {
      throw new Error("Message-attempt dispatch returned a duplicate identity.");
    }
    identities.add(identity);
  }
  return rows;
}

function boundedBatchSize(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Message-attempt dispatch batch size is invalid.");
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Message-attempt dispatch token is invalid.");
  }
}
