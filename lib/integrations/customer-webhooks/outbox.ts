import { createHash, randomUUID } from "node:crypto";
import type { CustomerWebhookEvent, Prisma } from "@prisma/client";
import {
  isCustomerWebhookEventType,
  type CustomerWebhookEventType
} from "@/lib/integrations/customer-webhooks/catalog";
import { canonicalizePublicApiJson } from "@/lib/public-api/idempotency";

const CUSTOMER_WEBHOOK_SCHEMA_VERSION = 1;
const CUSTOMER_WEBHOOK_API_VERSION = "2026-07-10";
const CUSTOMER_WEBHOOK_MAX_ATTEMPTS = 8;

export type CustomerWebhookOutboxResult = Readonly<{
  event: CustomerWebhookEvent;
  created: boolean;
  deliveryCount: number;
}>;

/**
 * Insert an immutable customer event and its endpoint deliveries inside the caller's existing domain
 * transaction. Callers must not invoke this after committing the associated resource mutation.
 */
export async function enqueueCustomerWebhookEvent(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    deduplicationKey: string;
    type: CustomerWebhookEventType;
    aggregateType: string;
    aggregateId?: string | null;
    data: Prisma.InputJsonValue;
  }>
): Promise<CustomerWebhookOutboxResult> {
  validateOutboxInput(input);
  const advisoryKey = createHash("sha256")
    .update(`signalstack/customer-webhook-outbox/v1\0${input.orgId}\0${input.deduplicationKey}`, "utf8")
    .digest()
    .readBigInt64BE(0);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey})`;

  const existing = await tx.customerWebhookEvent.findUnique({
    where: {
      orgId_deduplicationKey: {
        orgId: input.orgId,
        deduplicationKey: input.deduplicationKey
      }
    },
    include: { deliveries: { select: { id: true } } }
  });
  if (existing) {
    const { deliveries, ...event } = existing;
    return Object.freeze({ event, created: false, deliveryCount: deliveries.length });
  }

  const clockRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const occurredAt = clockRows[0]?.now;
  if (!occurredAt) {
    throw new Error("Customer webhook database clock is unavailable.");
  }

  const eventId = randomUUID();
  const payloadText = canonicalizePublicApiJson({
    apiVersion: CUSTOMER_WEBHOOK_API_VERSION,
    data: input.data,
    id: eventId,
    occurredAt: occurredAt.toISOString(),
    type: input.type
  });
  const payloadHash = createHash("sha256").update(payloadText, "utf8").digest("base64url");

  const candidates = await tx.customerWebhookSubscription.findMany({
    where: {
      orgId: input.orgId,
      eventTypes: { has: input.type },
      endpoint: { status: "ACTIVE" }
    },
    select: { endpointId: true }
  });
  const endpointIds = [...new Set(candidates.map((candidate) => candidate.endpointId))].sort();
  for (const endpointId of endpointIds) {
    // Endpoint administration and delivery finalization use the same endpoint-before-delivery
    // lock order. Re-read subscriptions after locking so disablement and secret rotation win
    // deterministically on one side of this immutable fanout snapshot.
    await tx.$queryRaw`
      SELECT id
      FROM "CustomerWebhookEndpoint"
      WHERE "orgId" = ${input.orgId} AND id = ${endpointId}
      FOR UPDATE
    `;
  }

  const subscriptions = endpointIds.length === 0 ? [] : await tx.customerWebhookSubscription.findMany({
    where: {
      orgId: input.orgId,
      endpointId: { in: endpointIds },
      eventTypes: { has: input.type },
      endpoint: { status: "ACTIVE" }
    },
    include: {
      signingSecrets: {
        where: { retiredAt: null },
        orderBy: { version: "desc" },
        take: 1
      }
    }
  });
  if (subscriptions.some((subscription) => subscription.signingSecrets.length !== 1)) {
    throw new Error("An active customer webhook subscription has no active signing secret.");
  }

  const event = await tx.customerWebhookEvent.create({
    data: {
      id: eventId,
      orgId: input.orgId,
      deduplicationKey: input.deduplicationKey,
      type: input.type,
      schemaVersion: CUSTOMER_WEBHOOK_SCHEMA_VERSION,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId ?? null,
      payloadText,
      payloadHash,
      occurredAt
    }
  });

  for (const subscription of subscriptions) {
    await tx.customerWebhookDelivery.create({
      data: {
        orgId: input.orgId,
        endpointId: subscription.endpointId,
        subscriptionId: subscription.id,
        eventId: event.id,
        signingSecretId: subscription.signingSecrets[0]!.id,
        generation: 1,
        maxAttempts: CUSTOMER_WEBHOOK_MAX_ATTEMPTS,
        nextAttemptAt: occurredAt
      }
    });
  }

  return Object.freeze({ event, created: true, deliveryCount: subscriptions.length });
}

function validateOutboxInput(input: Readonly<{
  orgId: string;
  deduplicationKey: string;
  type: string;
  aggregateType: string;
  aggregateId?: string | null;
}>): void {
  if (!isBoundedIdentifier(input.orgId, 191)) {
    throw new Error("Customer webhook organization is invalid.");
  }
  if (!isCustomerWebhookEventType(input.type)) {
    throw new Error("Customer webhook event type is invalid.");
  }
  if (!isBoundedSafeText(input.deduplicationKey, 191)) {
    throw new Error("Customer webhook deduplication key is invalid.");
  }
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(input.aggregateType)) {
    throw new Error("Customer webhook aggregate type is invalid.");
  }
  if (input.aggregateId !== undefined && input.aggregateId !== null && !isBoundedIdentifier(input.aggregateId, 191)) {
    throw new Error("Customer webhook aggregate identifier is invalid.");
  }
}

function isBoundedIdentifier(value: string, maximum: number): boolean {
  return value.length >= 1 && value.length <= maximum && value.trim() === value && !hasControl(value);
}

function isBoundedSafeText(value: string, maximum: number): boolean {
  return isBoundedIdentifier(value, maximum) && !/[\r\n]/.test(value);
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}
