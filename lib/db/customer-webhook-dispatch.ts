import { randomUUID } from "node:crypto";
import { withWorkerDispatchTransaction } from "@/lib/db/tenant-context";

export const CUSTOMER_WEBHOOK_PROCESSING_LEASE_MS = 30_000;

type CustomerWebhookDispatchRow = Readonly<{
  deliveryId: string;
  orgId: string;
}>;

export type CustomerWebhookDispatchDependencies = Readonly<{
  createProcessingToken?: () => string;
  claimRows?: (input: Readonly<{
    maxDeliveries: number;
    leaseMs: number;
    processingToken: string;
  }>) => Promise<readonly CustomerWebhookDispatchRow[]>;
}>;

export type CustomerWebhookDeliveryClaim = Readonly<{
  deliveryId: string;
  expectedOrgId: string;
  processingToken: string;
}>;

/** Invoke the worker's sole database-wide webhook discovery capability. */
export async function claimDueCustomerWebhookDeliveries(
  maxDeliveries: number,
  dependencies: CustomerWebhookDispatchDependencies = {}
): Promise<readonly CustomerWebhookDeliveryClaim[]> {
  if (!Number.isFinite(maxDeliveries)) {
    throw new Error("Customer webhook dispatch limit is invalid.");
  }
  const bounded = Math.min(100, Math.max(1, Math.trunc(maxDeliveries)));
  const processingToken = (dependencies.createProcessingToken ?? randomUUID)();
  if (!isProcessingToken(processingToken)) {
    throw new Error("Customer webhook dispatch generated an invalid processing token.");
  }
  const rows = await (dependencies.claimRows ?? queryClaimedRows)({
    maxDeliveries: bounded,
    leaseMs: CUSTOMER_WEBHOOK_PROCESSING_LEASE_MS,
    processingToken
  });
  if (!Array.isArray(rows)) {
    throw new Error("Customer webhook dispatch returned an invalid result.");
  }
  if (rows.length > bounded) {
    throw new Error("Customer webhook dispatch returned too many deliveries.");
  }
  const deliveryIds = new Set<string>();
  return Object.freeze(rows.map((row) => {
    if (!row || !isIdentifier(row.deliveryId) || !isIdentifier(row.orgId)) {
      throw new Error("Customer webhook dispatch returned an invalid delivery identity.");
    }
    if (deliveryIds.has(row.deliveryId)) {
      throw new Error("Customer webhook dispatch returned a duplicate delivery identity.");
    }
    deliveryIds.add(row.deliveryId);
    return Object.freeze({
      deliveryId: row.deliveryId,
      expectedOrgId: row.orgId,
      processingToken
    });
  }));
}

async function queryClaimedRows(input: Readonly<{
  maxDeliveries: number;
  leaseMs: number;
  processingToken: string;
}>): Promise<readonly CustomerWebhookDispatchRow[]> {
  return withWorkerDispatchTransaction((tx) => tx.$queryRaw<CustomerWebhookDispatchRow[]>`
    SELECT claimed."deliveryId", claimed."orgId"
    FROM public.claim_due_customer_webhook_deliveries(
      ${input.maxDeliveries}::integer,
      ${input.leaseMs}::integer,
      ${input.processingToken}::uuid
    ) AS claimed
  `);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 191 &&
    value.trim() === value &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
  );
}

function isProcessingToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}
