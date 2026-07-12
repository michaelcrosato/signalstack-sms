import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  normalizeCustomerWebhookEventTypes,
  type CustomerWebhookEventType
} from "@/lib/integrations/customer-webhooks/catalog";
import {
  assertSafeCustomerWebhookDnsAnswers,
  canonicalizeCustomerWebhookEndpointUrl,
  type CustomerWebhookDnsAnswer
} from "@/lib/integrations/customer-webhooks/endpoint-security";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import {
  createCustomerWebhookSigningSecret,
  readCustomerWebhookSecretsMasterKey
} from "@/lib/integrations/customer-webhooks/signing-secrets";
import { resolveCustomerWebhookDns } from "@/lib/integrations/customer-webhooks/transport";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import type { ApiCredentialActor } from "@/lib/public-api/api-credential-service";

const CUSTOMER_WEBHOOK_MASTER_KEY_VERSION = 1;
const CUSTOMER_WEBHOOK_MAX_ATTEMPTS = 8;

export type SafeCustomerWebhookEndpoint = Readonly<{
  id: string;
  name: string;
  url: string;
  status: "ACTIVE" | "DISABLED";
  eventTypes: readonly CustomerWebhookEventType[];
  signingSecret: Readonly<{ version: number; fingerprint: string }>;
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type RevealedCustomerWebhookEndpoint = Readonly<{
  endpoint: SafeCustomerWebhookEndpoint;
  signingSecret: string;
}>;

export type SafeCustomerWebhookDelivery = Readonly<{
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: string;
  generation: number;
  replayOfDeliveryId: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  deliveredAt: string | null;
  failedAt: string | null;
  lastStatusCode: number | null;
  lastErrorCode: string | null;
  attempts: readonly SafeCustomerWebhookDeliveryAttempt[];
  createdAt: string;
  updatedAt: string;
}>;

export type SafeCustomerWebhookDeliveryAttempt = Readonly<{
  id: string;
  generation: number;
  attemptNumber: number;
  requestTimestamp: string;
  statusCode: number | null;
  outcome: string;
  errorCode: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}>;

export class CustomerWebhookServiceError extends Error {
  readonly code:
    | "INVALID_WEBHOOK_ENDPOINT"
    | "WEBHOOK_ENDPOINT_NOT_FOUND"
    | "WEBHOOK_DELIVERY_NOT_FOUND"
    | "WEBHOOK_REPLAY_NOT_ALLOWED"
    | "WEBHOOK_SECRET_UNAVAILABLE";

  constructor(code: CustomerWebhookServiceError["code"], message: string) {
    super(message);
    this.name = "CustomerWebhookServiceError";
    this.code = code;
  }
}

/** Validate DNS at registration time; delivery transport repeats and pins this check on every attempt. */
export async function validateCustomerWebhookEndpointDestination(
  value: string,
  resolver: (hostname: string) => Promise<readonly CustomerWebhookDnsAnswer[]> = resolveCustomerWebhookDns
): Promise<string> {
  const canonicalUrl = canonicalizeCustomerWebhookEndpointUrl(value);
  const hostname = new URL(canonicalUrl).hostname;
  const answers = await Promise.race([
    resolver(hostname),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Customer webhook endpoint DNS validation timed out.")), 3_000);
      timer.unref?.();
    })
  ]);
  assertSafeCustomerWebhookDnsAnswers(hostname, answers);
  return canonicalUrl;
}

export async function listCustomerWebhookEndpoints(
  orgId: string,
  tx?: Prisma.TransactionClient,
  options?: Readonly<{ limit: number; cursor: Readonly<{ createdAt: Date; id: string }> | null }>
): Promise<readonly SafeCustomerWebhookEndpoint[]> {
  return runWebhookOperation(orgId, tx, async (client) => {
    const endpoints = await client.customerWebhookEndpoint.findMany({
      where: {
        orgId,
        ...(options?.cursor
          ? {
              OR: [
                { createdAt: { lt: options.cursor.createdAt } },
                { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options?.limit,
      include: endpointInclude
    });
    return Object.freeze(endpoints.map(toSafeEndpoint));
  });
}

export async function getCustomerWebhookEndpoint(
  orgId: string,
  endpointId: string,
  tx?: Prisma.TransactionClient
): Promise<SafeCustomerWebhookEndpoint | null> {
  assertIdentifier(endpointId, "endpoint");
  return runWebhookOperation(orgId, tx, async (client) => {
    const endpoint = await loadEndpoint(client, orgId, endpointId);
    return endpoint ? toSafeEndpoint(endpoint) : null;
  });
}

export async function createCustomerWebhookEndpoint(
  input: Readonly<{
    orgId: string;
    name: string;
    url: string;
    eventTypes: readonly string[];
    actor: ApiCredentialActor;
  }>,
  tx?: Prisma.TransactionClient,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<RevealedCustomerWebhookEndpoint> {
  const normalized = normalizeEndpointInput(input);
  const masterKey = readMasterKey(environment);
  return runWebhookOperation(input.orgId, tx, async (client) => {
    const endpointId = randomUUID();
    const subscriptionId = randomUUID();
    const secretId = randomUUID();
    const createdSecret = createCustomerWebhookSigningSecret({
      masterKey,
      keyVersion: CUSTOMER_WEBHOOK_MASTER_KEY_VERSION,
      binding: {
        orgId: normalized.orgId,
        endpointId,
        subscriptionId,
        secretId,
        secretVersion: 1
      }
    });
    const endpoint = await client.customerWebhookEndpoint.create({
      data: {
        id: endpointId,
        orgId: normalized.orgId,
        name: normalized.name,
        canonicalUrl: normalized.url
      }
    });
    const subscription = await client.customerWebhookSubscription.create({
      data: {
        id: subscriptionId,
        orgId: normalized.orgId,
        endpointId: endpoint.id,
        eventTypes: normalized.eventTypes
      }
    });
    await client.customerWebhookSigningSecret.create({
      data: {
        id: secretId,
        orgId: normalized.orgId,
        subscriptionId: subscription.id,
        version: 1,
        ciphertext: createdSecret.envelope.ciphertext,
        iv: createdSecret.envelope.iv,
        authTag: createdSecret.envelope.authTag,
        keyVersion: createdSecret.envelope.keyVersion,
        fingerprint: createdSecret.envelope.fingerprint
      }
    });
    await createAuditEvent(client, {
      orgId: normalized.orgId,
      actor: input.actor,
      action: "customer_webhook_endpoint.created",
      subjectType: "customer_webhook_endpoint",
      subjectId: endpoint.id,
      metadata: { url: endpoint.canonicalUrl, eventTypes: normalized.eventTypes }
    });
    const saved = await loadEndpoint(client, normalized.orgId, endpoint.id);
    if (!saved) {
      throw new Error("Created customer webhook endpoint could not be reloaded.");
    }
    return Object.freeze({ endpoint: toSafeEndpoint(saved), signingSecret: createdSecret.secret });
  });
}

export async function updateCustomerWebhookEndpoint(
  input: Readonly<{
    orgId: string;
    endpointId: string;
    name?: string;
    eventTypes?: readonly string[];
    enabled?: boolean;
    actor: ApiCredentialActor;
  }>,
  tx?: Prisma.TransactionClient
): Promise<SafeCustomerWebhookEndpoint> {
  assertIdentifier(input.orgId, "organization");
  assertIdentifier(input.endpointId, "endpoint");
  const name = input.name === undefined ? undefined : normalizeName(input.name);
  const eventTypes =
    input.eventTypes === undefined ? undefined : normalizeEventTypes(input.eventTypes);
  if (name === undefined && eventTypes === undefined && input.enabled === undefined) {
    throw new CustomerWebhookServiceError("INVALID_WEBHOOK_ENDPOINT", "No webhook endpoint change was supplied.");
  }

  return runWebhookOperation(input.orgId, tx, async (client) => {
    await lockEndpoint(client, input.orgId, input.endpointId);
    const existing = await loadEndpoint(client, input.orgId, input.endpointId);
    if (!existing) {
      throw new CustomerWebhookServiceError("WEBHOOK_ENDPOINT_NOT_FOUND", "Webhook endpoint not found.");
    }
    const now = await databaseNow(client);
    await client.customerWebhookEndpoint.update({
      where: { id: existing.id },
      data: {
        name,
        status: input.enabled === undefined ? undefined : input.enabled ? "ACTIVE" : "DISABLED",
        disabledAt: input.enabled === undefined ? undefined : input.enabled ? null : now,
        consecutiveFailures: input.enabled === true ? 0 : undefined
      }
    });
    if (eventTypes !== undefined) {
      await client.customerWebhookSubscription.update({
        where: { orgId_endpointId: { orgId: input.orgId, endpointId: existing.id } },
        data: { eventTypes }
      });
    }
    if (input.enabled === false) {
      await client.customerWebhookDelivery.updateMany({
        where: {
          orgId: input.orgId,
          endpointId: existing.id,
          status: "PENDING"
        },
        data: { status: "CANCELED", processingToken: null, processingExpiresAt: null }
      });
      await enqueueCustomerWebhookEvent(client, {
        orgId: input.orgId,
        deduplicationKey: `webhook.endpoint.disabled:manual:${existing.id}:${now.toISOString()}`,
        type: "webhook.endpoint.disabled",
        aggregateType: "customer_webhook_endpoint",
        aggregateId: existing.id,
        data: { endpointId: existing.id, reason: "manual" }
      });
    }
    await createAuditEvent(client, {
      orgId: input.orgId,
      actor: input.actor,
      action: input.enabled === false
        ? "customer_webhook_endpoint.disabled"
        : input.enabled === true
          ? "customer_webhook_endpoint.enabled"
          : "customer_webhook_endpoint.updated",
      subjectType: "customer_webhook_endpoint",
      subjectId: existing.id,
      metadata: {
        name: name ?? existing.name,
        eventTypes: eventTypes ?? existing.subscriptions[0]?.eventTypes ?? [],
        enabled: input.enabled ?? existing.status === "ACTIVE"
      }
    });
    const saved = await loadEndpoint(client, input.orgId, existing.id);
    if (!saved) {
      throw new Error("Updated customer webhook endpoint could not be reloaded.");
    }
    return toSafeEndpoint(saved);
  });
}

export async function rotateCustomerWebhookSigningSecret(
  input: Readonly<{
    orgId: string;
    endpointId: string;
    actor: ApiCredentialActor;
  }>,
  tx?: Prisma.TransactionClient,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<RevealedCustomerWebhookEndpoint> {
  assertIdentifier(input.orgId, "organization");
  assertIdentifier(input.endpointId, "endpoint");
  const masterKey = readMasterKey(environment);
  return runWebhookOperation(input.orgId, tx, async (client) => {
    await lockEndpoint(client, input.orgId, input.endpointId);
    const existing = await loadEndpoint(client, input.orgId, input.endpointId);
    const subscription = existing?.subscriptions[0];
    const activeSecret = subscription?.signingSecrets[0];
    if (!existing || !subscription || !activeSecret) {
      throw new CustomerWebhookServiceError("WEBHOOK_ENDPOINT_NOT_FOUND", "Webhook endpoint not found.");
    }
    const version = activeSecret.version + 1;
    const secretId = randomUUID();
    const now = await databaseNow(client);
    const createdSecret = createCustomerWebhookSigningSecret({
      masterKey,
      keyVersion: CUSTOMER_WEBHOOK_MASTER_KEY_VERSION,
      binding: {
        orgId: input.orgId,
        endpointId: existing.id,
        subscriptionId: subscription.id,
        secretId,
        secretVersion: version
      }
    });
    await client.customerWebhookSigningSecret.update({
      where: { id: activeSecret.id },
      data: { retiredAt: now }
    });
    await client.customerWebhookSigningSecret.create({
      data: {
        id: secretId,
        orgId: input.orgId,
        subscriptionId: subscription.id,
        version,
        ciphertext: createdSecret.envelope.ciphertext,
        iv: createdSecret.envelope.iv,
        authTag: createdSecret.envelope.authTag,
        keyVersion: createdSecret.envelope.keyVersion,
        fingerprint: createdSecret.envelope.fingerprint,
        activeFrom: now
      }
    });
    await createAuditEvent(client, {
      orgId: input.orgId,
      actor: input.actor,
      action: "customer_webhook_signing_secret.rotated",
      subjectType: "customer_webhook_endpoint",
      subjectId: existing.id,
      metadata: { previousVersion: activeSecret.version, version }
    });
    const saved = await loadEndpoint(client, input.orgId, existing.id);
    if (!saved) {
      throw new Error("Rotated customer webhook endpoint could not be reloaded.");
    }
    return Object.freeze({ endpoint: toSafeEndpoint(saved), signingSecret: createdSecret.secret });
  });
}

export async function listCustomerWebhookDeliveries(
  orgId: string,
  endpointId: string,
  tx?: Prisma.TransactionClient,
  options?: Readonly<{ limit: number; cursor: Readonly<{ createdAt: Date; id: string }> | null }>
): Promise<readonly SafeCustomerWebhookDelivery[]> {
  assertIdentifier(endpointId, "endpoint");
  return runWebhookOperation(orgId, tx, async (client) => {
    const endpoint = await client.customerWebhookEndpoint.findFirst({ where: { orgId, id: endpointId } });
    if (!endpoint) {
      throw new CustomerWebhookServiceError("WEBHOOK_ENDPOINT_NOT_FOUND", "Webhook endpoint not found.");
    }
    const deliveries = await client.customerWebhookDelivery.findMany({
      where: {
        orgId,
        endpointId,
        ...(options?.cursor
          ? {
              OR: [
                { createdAt: { lt: options.cursor.createdAt } },
                { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options?.limit ?? 100,
      include: deliveryInclude
    });
    return Object.freeze(deliveries.map(toSafeDelivery));
  });
}

export async function replayCustomerWebhookDelivery(
  input: Readonly<{
    orgId: string;
    deliveryId: string;
    actor: ApiCredentialActor;
  }>,
  tx?: Prisma.TransactionClient
): Promise<SafeCustomerWebhookDelivery> {
  assertIdentifier(input.orgId, "organization");
  assertIdentifier(input.deliveryId, "delivery");
  return runWebhookOperation(input.orgId, tx, async (client) => {
    const candidate = await client.customerWebhookDelivery.findFirst({
      where: { orgId: input.orgId, id: input.deliveryId },
      select: { endpointId: true, eventId: true }
    });
    if (!candidate) {
      throw new CustomerWebhookServiceError("WEBHOOK_DELIVERY_NOT_FOUND", "Webhook delivery not found.");
    }
    // Topology is authoritative at replay creation. Endpoint administration uses this same row
    // lock, so disablement/rotation either completes before the re-read or waits until the replay
    // has atomically pinned its current secret.
    await lockEndpoint(client, input.orgId, candidate.endpointId);
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer-webhook-replay:${input.orgId}:${candidate.endpointId}:${candidate.eventId}`}, 0))`;
    const original = await client.customerWebhookDelivery.findFirst({
      where: { orgId: input.orgId, id: input.deliveryId },
      include: {
        subscription: {
          include: {
            endpoint: true,
            signingSecrets: { where: { retiredAt: null }, orderBy: { version: "desc" }, take: 1 }
          }
        },
        event: true
      }
    });
    if (
      !original ||
      original.endpointId !== candidate.endpointId ||
      original.eventId !== candidate.eventId
    ) {
      throw new CustomerWebhookServiceError("WEBHOOK_DELIVERY_NOT_FOUND", "Webhook delivery not found.");
    }
    if (original.status !== "FAILED" || original.subscription.endpoint.status !== "ACTIVE") {
      throw new CustomerWebhookServiceError(
        "WEBHOOK_REPLAY_NOT_ALLOWED",
        "Only a failed delivery for an active endpoint can be replayed."
      );
    }
    const activeSecret = original.subscription.signingSecrets[0];
    if (!activeSecret) {
      throw new CustomerWebhookServiceError("WEBHOOK_SECRET_UNAVAILABLE", "Webhook signing secret is unavailable.");
    }
    const latest = await client.customerWebhookDelivery.findFirst({
      where: { orgId: input.orgId, endpointId: original.endpointId, eventId: original.eventId },
      orderBy: { generation: "desc" },
      select: { generation: true }
    });
    const replay = await client.customerWebhookDelivery.create({
      data: {
        orgId: input.orgId,
        endpointId: original.endpointId,
        subscriptionId: original.subscriptionId,
        eventId: original.eventId,
        signingSecretId: activeSecret.id,
        generation: (latest?.generation ?? original.generation) + 1,
        replayOfDeliveryId: original.id,
        maxAttempts: CUSTOMER_WEBHOOK_MAX_ATTEMPTS
      },
      include: deliveryInclude
    });
    await createAuditEvent(client, {
      orgId: input.orgId,
      actor: input.actor,
      action: "customer_webhook_delivery.replayed",
      subjectType: "customer_webhook_delivery",
      subjectId: replay.id,
      metadata: { originalDeliveryId: original.id, eventId: original.eventId, generation: replay.generation }
    });
    return toSafeDelivery(replay);
  });
}

const endpointInclude = {
  subscriptions: {
    include: {
      signingSecrets: {
        where: { retiredAt: null },
        orderBy: { version: "desc" as const },
        take: 1
      }
    }
  }
} satisfies Prisma.CustomerWebhookEndpointInclude;

const deliveryInclude = {
  event: { select: { type: true } },
  attempts: {
    orderBy: [{ attemptNumber: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      generation: true,
      attemptNumber: true,
      requestTimestamp: true,
      statusCode: true,
      outcome: true,
      errorCode: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true
    }
  }
} satisfies Prisma.CustomerWebhookDeliveryInclude;

async function loadEndpoint(tx: Prisma.TransactionClient, orgId: string, endpointId: string) {
  return tx.customerWebhookEndpoint.findFirst({
    where: { orgId, id: endpointId },
    include: endpointInclude
  });
}

function toSafeEndpoint(endpoint: Prisma.CustomerWebhookEndpointGetPayload<{ include: typeof endpointInclude }>): SafeCustomerWebhookEndpoint {
  const subscription = endpoint.subscriptions[0];
  const secret = subscription?.signingSecrets[0];
  if (!subscription || !secret) {
    throw new CustomerWebhookServiceError("WEBHOOK_SECRET_UNAVAILABLE", "Webhook signing secret is unavailable.");
  }
  return Object.freeze({
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.canonicalUrl,
    status: endpoint.status,
    eventTypes: Object.freeze(normalizeEventTypes(subscription.eventTypes)),
    signingSecret: Object.freeze({ version: secret.version, fingerprint: secret.fingerprint }),
    consecutiveFailures: endpoint.consecutiveFailures,
    lastFailureAt: endpoint.lastFailureAt?.toISOString() ?? null,
    lastSuccessAt: endpoint.lastSuccessAt?.toISOString() ?? null,
    disabledAt: endpoint.disabledAt?.toISOString() ?? null,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString()
  });
}

function toSafeDelivery(
  delivery: Prisma.CustomerWebhookDeliveryGetPayload<{ include: typeof deliveryInclude }>
): SafeCustomerWebhookDelivery {
  return Object.freeze({
    id: delivery.id,
    endpointId: delivery.endpointId,
    eventId: delivery.eventId,
    eventType: delivery.event.type,
    status: delivery.status,
    generation: delivery.generation,
    replayOfDeliveryId: delivery.replayOfDeliveryId,
    attemptCount: delivery.attemptCount,
    maxAttempts: delivery.maxAttempts,
    nextAttemptAt: delivery.nextAttemptAt.toISOString(),
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    failedAt: delivery.failedAt?.toISOString() ?? null,
    lastStatusCode: delivery.lastStatusCode,
    lastErrorCode: delivery.lastErrorCode,
    attempts: Object.freeze(delivery.attempts.map((attempt) => Object.freeze({
      id: attempt.id,
      generation: attempt.generation,
      attemptNumber: attempt.attemptNumber,
      requestTimestamp: attempt.requestTimestamp.toISOString(),
      statusCode: attempt.statusCode,
      outcome: attempt.outcome ?? "started",
      errorCode: attempt.errorCode,
      startedAt: attempt.startedAt.toISOString(),
      finishedAt: attempt.finishedAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString()
    }))),
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString()
  });
}

function normalizeEndpointInput(input: Readonly<{ orgId: string; name: string; url: string; eventTypes: readonly string[] }>) {
  assertIdentifier(input.orgId, "organization");
  return Object.freeze({
    orgId: input.orgId,
    name: normalizeName(input.name),
    url: canonicalizeCustomerWebhookEndpointUrl(input.url),
    eventTypes: normalizeEventTypes(input.eventTypes)
  });
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > 120 || hasControl(name)) {
    throw new CustomerWebhookServiceError("INVALID_WEBHOOK_ENDPOINT", "Webhook endpoint name is invalid.");
  }
  return name;
}

function normalizeEventTypes(values: readonly unknown[]): CustomerWebhookEventType[] {
  let normalized: CustomerWebhookEventType[];
  try {
    normalized = normalizeCustomerWebhookEventTypes(values);
  } catch {
    throw new CustomerWebhookServiceError("INVALID_WEBHOOK_ENDPOINT", "Webhook event types are invalid.");
  }
  if (normalized.length < 1) {
    throw new CustomerWebhookServiceError("INVALID_WEBHOOK_ENDPOINT", "At least one webhook event type is required.");
  }
  return normalized;
}

function readMasterKey(environment: Readonly<Record<string, string | undefined>>): Buffer {
  try {
    return readCustomerWebhookSecretsMasterKey(environment);
  } catch {
    throw new CustomerWebhookServiceError("WEBHOOK_SECRET_UNAVAILABLE", "Webhook secret service is unavailable.");
  }
}

async function runWebhookOperation<T>(orgId: string, tx: Prisma.TransactionClient | undefined, operation: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  assertIdentifier(orgId, "organization");
  return tx ? operation(tx) : withTenantTransaction({ orgId }, operation);
}

async function lockEndpoint(tx: Prisma.TransactionClient, orgId: string, endpointId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "CustomerWebhookEndpoint" WHERE "orgId" = ${orgId} AND id = ${endpointId} FOR UPDATE`;
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!rows[0]?.now) {
    throw new Error("Customer webhook database clock is unavailable.");
  }
  return rows[0].now;
}

async function createAuditEvent(tx: Prisma.TransactionClient, input: Readonly<{ orgId: string; actor: ApiCredentialActor; action: string; subjectType: string; subjectId: string; metadata: Prisma.InputJsonValue }>): Promise<void> {
  await tx.integrationAuditEvent.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actor.kind === "user" ? input.actor.userId : null,
      apiCredentialId: input.actor.kind === "api_credential" ? input.actor.credentialId : null,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: input.metadata
    }
  });
}

function assertIdentifier(value: string, name: string): void {
  if (value.length < 1 || value.length > 191 || value.trim() !== value || hasControl(value)) {
    throw new CustomerWebhookServiceError("INVALID_WEBHOOK_ENDPOINT", `Webhook ${name} is invalid.`);
  }
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}
