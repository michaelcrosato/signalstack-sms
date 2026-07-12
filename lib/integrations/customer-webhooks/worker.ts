import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  classifyCustomerWebhookAttempt,
  type CustomerWebhookAttemptDecision,
  type CustomerWebhookTransportFailureKind
} from "@/lib/integrations/customer-webhooks/delivery-policy";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { signCustomerWebhookPayload, customerWebhookTimestampSeconds } from "@/lib/integrations/customer-webhooks/signatures";
import {
  CustomerWebhookSigningSecretError,
  decryptCustomerWebhookSigningSecret,
  readCustomerWebhookSecretsMasterKey,
  type CustomerWebhookSigningSecretEnvelope
} from "@/lib/integrations/customer-webhooks/signing-secrets";
import {
  postCustomerWebhook,
  CustomerWebhookTransportError
} from "@/lib/integrations/customer-webhooks/transport";
import {
  claimDueCustomerWebhookDeliveries,
  CUSTOMER_WEBHOOK_PROCESSING_LEASE_MS,
  type CustomerWebhookDeliveryClaim
} from "@/lib/db/customer-webhook-dispatch";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { logger } from "@/lib/observability/logger";

const AUTO_DISABLE_TERMINAL_FAILURES = 10;
const CUSTOMER_WEBHOOK_USER_AGENT = "SignalStack-Customer-Webhooks/1";

export type PreparedCustomerWebhookDelivery = Readonly<{
  orgId: string;
  deliveryId: string;
  endpointId: string;
  endpointUrl: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  payloadText: string;
  payloadHash: string;
  secretId: string;
  secretVersion: number;
  attemptId: string;
  requestTimestamp: Date;
  envelope: Readonly<{
    envelopeVersion: number;
    algorithm: string;
    keyVersion: number;
    iv: string;
    ciphertext: string;
    authTag: string;
    fingerprint: string;
  }>;
  attemptNumber: number;
  maxAttempts: number;
  generation: number;
  startedAt: Date;
}>;

export type CustomerWebhookFinalizationEvidence = Readonly<{
  requestTimestamp: Date;
  statusCode?: number;
  errorCode?: string;
}>;

export type CustomerWebhookTenantTransactionRunner = <T>(
  context: Readonly<{ orgId: string }>,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) => Promise<T>;

export type CustomerWebhookWorkerRunResult = Readonly<{
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  skipped: number;
}>;

export type CustomerWebhookClaimOutcome = "delivered" | "retry" | "failed" | "skipped";

export async function processDueCustomerWebhookDeliveries(
  maxDeliveries = 25,
  dependencies: Readonly<{
    claim?: typeof claimDueCustomerWebhookDeliveries;
    processClaim?: (claim: CustomerWebhookDeliveryClaim) => Promise<CustomerWebhookClaimOutcome>;
  }> = {}
): Promise<CustomerWebhookWorkerRunResult> {
  const claims = await (dependencies.claim ?? claimDueCustomerWebhookDeliveries)(maxDeliveries);
  let delivered = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;

  for (const claim of claims) {
    try {
      const outcome = await (dependencies.processClaim ?? processClaimedCustomerWebhookDelivery)(claim);
      if (outcome === "delivered") delivered += 1;
      else if (outcome === "retry") retried += 1;
      else if (outcome === "failed") failed += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      logger.error("customer_webhook_delivery_processing_failed", {
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
    }
  }
  return Object.freeze({ claimed: claims.length, delivered, retried, failed, skipped });
}

export async function processClaimedCustomerWebhookDelivery(
  claim: CustomerWebhookDeliveryClaim,
  dependencies: Readonly<{
    post?: typeof postCustomerWebhook;
    environment?: Readonly<Record<string, string | undefined>>;
    now?: () => Date;
    prepare?: (claim: CustomerWebhookDeliveryClaim) => Promise<PreparedCustomerWebhookDelivery | null>;
    finalize?: (
      claim: CustomerWebhookDeliveryClaim,
      prepared: PreparedCustomerWebhookDelivery,
      decision: CustomerWebhookAttemptDecision,
      evidence: CustomerWebhookFinalizationEvidence
    ) => Promise<boolean>;
  }> = {}
): Promise<CustomerWebhookClaimOutcome> {
  assertCustomerWebhookDeliveryClaim(claim);
  const prepared = await (dependencies.prepare ?? prepareClaimedCustomerWebhookDelivery)(claim);
  if (!prepared) {
    return "skipped";
  }
  assertPreparedDeliveryMatchesClaim(claim, prepared);

  const policyNow = dependencies.now?.() ?? prepared.requestTimestamp;
  const timestampSeconds = customerWebhookTimestampSeconds(prepared.requestTimestamp);
  const requestTimestamp = prepared.requestTimestamp;
  let decision: CustomerWebhookAttemptDecision;
  let statusCode: number | undefined;
  let errorCode: string | undefined;
  let signedRequest: Readonly<{ rawBody: Buffer; headers: Readonly<Record<string, string>> }> | null = null;

  try {
    signedRequest = createSignedRequest(prepared, timestampSeconds, dependencies.environment ?? process.env);
  } catch (error) {
    ({ decision, errorCode } = classifyPreparationFailure(prepared, error, policyNow.getTime()));
  }

  if (signedRequest) {
    try {
      const response = await (dependencies.post ?? postCustomerWebhook)({
        endpointUrl: prepared.endpointUrl,
        rawBody: signedRequest.rawBody,
        headers: signedRequest.headers
      });
      statusCode = response.statusCode;
      decision = classifyCustomerWebhookAttempt({
        attemptNumber: prepared.attemptNumber,
        maxAttempts: prepared.maxAttempts,
        statusCode,
        retryAfterHeader: response.retryAfter,
        nowMilliseconds: policyNow.getTime()
      });
    } catch (error) {
      ({ decision, errorCode } = classifyTransportFailure(prepared, error, policyNow.getTime()));
    }
  }

  const finalized = await (dependencies.finalize ?? finalizeClaimedCustomerWebhookDelivery)(
    claim,
    prepared,
    decision!,
    { requestTimestamp, statusCode, errorCode }
  );
  if (!finalized) {
    return "skipped";
  }
  return decision!.outcome === "delivered" ? "delivered" : decision!.outcome === "retry" ? "retry" : "failed";
}

export async function prepareClaimedCustomerWebhookDelivery(
  claim: CustomerWebhookDeliveryClaim,
  dependencies: Readonly<{ transaction?: CustomerWebhookTenantTransactionRunner }> = {}
): Promise<PreparedCustomerWebhookDelivery | null> {
  assertCustomerWebhookDeliveryClaim(claim);
  const transaction = dependencies.transaction ?? withTenantTransaction;
  return transaction({ orgId: claim.expectedOrgId }, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerWebhookDelivery" WHERE "orgId" = ${claim.expectedOrgId} AND id = ${claim.deliveryId} FOR UPDATE`;
    const delivery = await tx.customerWebhookDelivery.findFirst({
      where: {
        orgId: claim.expectedOrgId,
        id: claim.deliveryId,
        status: "PROCESSING",
        processingToken: claim.processingToken
      },
      include: {
        event: true,
        signingSecret: true,
        subscription: { include: { endpoint: true } }
      }
    });
    if (!delivery || delivery.subscription.endpoint.status !== "ACTIVE") {
      return null;
    }
    const startedAt = await databaseNow(tx);
    if (!delivery.processingExpiresAt || delivery.processingExpiresAt.getTime() <= startedAt.getTime()) {
      return null;
    }
    let completedAttemptCount = delivery.attemptCount;
    const unfinishedAttempt = await tx.customerWebhookDeliveryAttempt.findFirst({
      where: {
        orgId: claim.expectedOrgId,
        deliveryId: delivery.id,
        generation: delivery.generation,
        outcome: null,
        finishedAt: null
      },
      orderBy: [{ attemptNumber: "desc" }, { id: "desc" }]
    });
    if (unfinishedAttempt) {
      if (unfinishedAttempt.attemptNumber !== completedAttemptCount + 1) {
        throw new Error("Customer webhook unfinished attempt sequence is invalid.");
      }
      const recovered = await tx.customerWebhookDeliveryAttempt.updateMany({
        where: { id: unfinishedAttempt.id, outcome: null, finishedAt: null },
        data: {
          outcome: "ambiguous",
          errorCode: "WORKER_LEASE_EXPIRED",
          finishedAt: startedAt
        }
      });
      if (recovered.count !== 1) {
        throw new Error("Customer webhook unfinished attempt recovery conflicted.");
      }
      completedAttemptCount = unfinishedAttempt.attemptNumber;
      if (completedAttemptCount >= delivery.maxAttempts) {
        await tx.customerWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            attemptCount: completedAttemptCount,
            processingToken: null,
            processingExpiresAt: null,
            failedAt: startedAt,
            lastErrorCode: "AMBIGUOUS_ATTEMPT_EXHAUSTED"
          }
        });
        return null;
      }
      await tx.customerWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attemptCount: completedAttemptCount,
          lastErrorCode: "WORKER_LEASE_EXPIRED"
        }
      });
    }
    if (completedAttemptCount >= delivery.maxAttempts) {
      return null;
    }
    const attemptNumber = completedAttemptCount + 1;
    const requestTimestamp = new Date(Math.floor(startedAt.getTime() / 1_000) * 1_000);
    const attempt = await tx.customerWebhookDeliveryAttempt.create({
      data: {
        orgId: claim.expectedOrgId,
        deliveryId: delivery.id,
        generation: delivery.generation,
        attemptNumber,
        requestTimestamp,
        outcome: null,
        startedAt,
        finishedAt: null
      },
      select: { id: true }
    });
    await tx.customerWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        processingExpiresAt: new Date(startedAt.getTime() + CUSTOMER_WEBHOOK_PROCESSING_LEASE_MS)
      }
    });
    return Object.freeze({
      orgId: delivery.orgId,
      deliveryId: delivery.id,
      endpointId: delivery.endpointId,
      endpointUrl: delivery.subscription.endpoint.canonicalUrl,
      subscriptionId: delivery.subscriptionId,
      eventId: delivery.eventId,
      eventType: delivery.event.type,
      payloadText: delivery.event.payloadText,
      payloadHash: delivery.event.payloadHash,
      secretId: delivery.signingSecret.id,
      secretVersion: delivery.signingSecret.version,
      attemptId: attempt.id,
      requestTimestamp,
      envelope: Object.freeze({
        envelopeVersion: delivery.signingSecret.envelopeVersion,
        algorithm: delivery.signingSecret.algorithm,
        keyVersion: delivery.signingSecret.keyVersion,
        iv: delivery.signingSecret.iv,
        ciphertext: delivery.signingSecret.ciphertext,
        authTag: delivery.signingSecret.authTag,
        fingerprint: delivery.signingSecret.fingerprint
      }),
      attemptNumber,
      maxAttempts: delivery.maxAttempts,
      generation: delivery.generation,
      startedAt
    });
  });
}

export async function finalizeClaimedCustomerWebhookDelivery(
  claim: CustomerWebhookDeliveryClaim,
  prepared: PreparedCustomerWebhookDelivery,
  decision: CustomerWebhookAttemptDecision,
  evidence: CustomerWebhookFinalizationEvidence,
  dependencies: Readonly<{
    transaction?: CustomerWebhookTenantTransactionRunner;
    enqueueEvent?: typeof enqueueCustomerWebhookEvent;
  }> = {}
): Promise<boolean> {
  assertCustomerWebhookDeliveryClaim(claim);
  assertPreparedDeliveryMatchesClaim(claim, prepared);
  assertFinalizationEvidence(evidence);
  if (evidence.requestTimestamp.getTime() !== prepared.requestTimestamp.getTime()) {
    throw new Error("Customer webhook finalization timestamp does not match its reservation.");
  }
  const transaction = dependencies.transaction ?? withTenantTransaction;
  return transaction({ orgId: claim.expectedOrgId }, async (tx) => {
    // Endpoint state and its delivery rows always lock in this order. Administration uses the
    // same ordering, so concurrent terminal attempts cannot lose failure increments or deadlock
    // an operator disablement.
    await tx.$queryRaw`
      SELECT id
      FROM "CustomerWebhookEndpoint"
      WHERE "orgId" = ${claim.expectedOrgId} AND id = ${prepared.endpointId}
      FOR UPDATE
    `;
    await tx.$queryRaw`SELECT id FROM "CustomerWebhookDelivery" WHERE "orgId" = ${claim.expectedOrgId} AND id = ${claim.deliveryId} FOR UPDATE`;
    const delivery = await tx.customerWebhookDelivery.findFirst({
      where: {
        orgId: claim.expectedOrgId,
        id: claim.deliveryId,
        status: "PROCESSING",
        processingToken: claim.processingToken,
        generation: prepared.generation,
        attemptCount: prepared.attemptNumber - 1,
        endpointId: prepared.endpointId
      },
      include: { subscription: { include: { endpoint: true } } }
    });
    if (!delivery) {
      return false;
    }
    const finishedAt = await databaseNow(tx);
    const reservedAttempt = await tx.customerWebhookDeliveryAttempt.findFirst({
      where: {
        id: prepared.attemptId,
        orgId: claim.expectedOrgId,
        deliveryId: delivery.id,
        generation: delivery.generation,
        attemptNumber: prepared.attemptNumber,
        requestTimestamp: prepared.requestTimestamp,
        outcome: null,
        finishedAt: null
      },
      select: { id: true }
    });
    if (!reservedAttempt) {
      return false;
    }
    const completedAttempt = await tx.customerWebhookDeliveryAttempt.updateMany({
      where: { id: reservedAttempt.id, outcome: null, finishedAt: null },
      data: {
        statusCode: evidence.statusCode ?? null,
        outcome: decision.outcome,
        errorCode: evidence.errorCode ?? (decision.outcome === "delivered" ? null : decision.reason),
        finishedAt
      }
    });
    if (completedAttempt.count !== 1) {
      return false;
    }

    const endpointDisabled = delivery.subscription.endpoint.status !== "ACTIVE";

    // Disabling an endpoint never erases a live lease. If the HTTP attempt already happened,
    // retain its immutable evidence here and suppress any follow-up retry.
    if (endpointDisabled && decision.outcome !== "delivered") {
      await tx.customerWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "CANCELED",
          attemptCount: prepared.attemptNumber,
          processingToken: null,
          processingExpiresAt: null,
          lastStatusCode: evidence.statusCode ?? null,
          lastErrorCode: "ENDPOINT_DISABLED"
        }
      });
      return true;
    }

    if (decision.outcome === "delivered") {
      await tx.customerWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          attemptCount: prepared.attemptNumber,
          processingToken: null,
          processingExpiresAt: null,
          deliveredAt: finishedAt,
          failedAt: null,
          lastStatusCode: evidence.statusCode ?? null,
          lastErrorCode: null
        }
      });
      if (!endpointDisabled) {
        await tx.customerWebhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { consecutiveFailures: 0, lastSuccessAt: finishedAt }
        });
      }
      return true;
    }

    if (decision.outcome === "retry" && decision.retryDelaySeconds !== null) {
      await tx.customerWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "PENDING",
          attemptCount: prepared.attemptNumber,
          processingToken: null,
          processingExpiresAt: null,
          nextAttemptAt: new Date(finishedAt.getTime() + decision.retryDelaySeconds * 1_000),
          lastStatusCode: evidence.statusCode ?? null,
          lastErrorCode: evidence.errorCode ?? decision.reason
        }
      });
      return true;
    }

    const nextFailureCount = delivery.subscription.endpoint.consecutiveFailures + 1;
    const shouldDisable = decision.outcome === "disable" || nextFailureCount >= AUTO_DISABLE_TERMINAL_FAILURES;
    await tx.customerWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attemptCount: prepared.attemptNumber,
        processingToken: null,
        processingExpiresAt: null,
        failedAt: finishedAt,
        lastStatusCode: evidence.statusCode ?? null,
        lastErrorCode: evidence.errorCode ?? decision.reason
      }
    });
    await tx.customerWebhookEndpoint.update({
      where: { id: delivery.endpointId },
      data: {
        consecutiveFailures: nextFailureCount,
        lastFailureAt: finishedAt,
        ...(shouldDisable ? { status: "DISABLED" as const, disabledAt: finishedAt } : {})
      }
    });
    if (shouldDisable) {
      await tx.customerWebhookDelivery.updateMany({
        where: {
          orgId: claim.expectedOrgId,
          endpointId: delivery.endpointId,
          id: { not: delivery.id },
          status: "PENDING"
        },
        data: { status: "CANCELED", processingToken: null, processingExpiresAt: null }
      });
      await tx.integrationAuditEvent.create({
        data: {
          orgId: claim.expectedOrgId,
          action: "customer_webhook_endpoint.auto_disabled",
          subjectType: "customer_webhook_endpoint",
          subjectId: delivery.endpointId,
          metadata: { deliveryId: delivery.id, reason: decision.reason, consecutiveFailures: nextFailureCount }
        }
      });
      await tryEnqueueEndpointDisabledEvent(
        tx,
        dependencies.enqueueEvent ?? enqueueCustomerWebhookEvent,
        {
          orgId: claim.expectedOrgId,
          deliveryId: delivery.id,
          endpointId: delivery.endpointId,
          reason: decision.reason
        }
      );
    }
    return true;
  });
}

async function tryEnqueueEndpointDisabledEvent(
  tx: Prisma.TransactionClient,
  enqueueEvent: typeof enqueueCustomerWebhookEvent,
  input: Readonly<{
    orgId: string;
    deliveryId: string;
    endpointId: string;
    reason: CustomerWebhookAttemptDecision["reason"];
  }>
): Promise<void> {
  await tx.$executeRawUnsafe("SAVEPOINT signalstack_customer_webhook_disable_event");
  try {
    await enqueueEvent(tx, {
      orgId: input.orgId,
      deduplicationKey: `webhook.endpoint.disabled:${input.endpointId}:${input.deliveryId}`,
      type: "webhook.endpoint.disabled",
      aggregateType: "customer_webhook_endpoint",
      aggregateId: input.endpointId,
      data: { endpointId: input.endpointId, reason: input.reason }
    });
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT signalstack_customer_webhook_disable_event");
  } catch (error) {
    try {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT signalstack_customer_webhook_disable_event");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT signalstack_customer_webhook_disable_event");
    } catch {
      throw error;
    }
    logger.error("customer_webhook_endpoint_disabled_event_enqueue_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
}

function createSignedRequest(
  prepared: PreparedCustomerWebhookDelivery,
  timestampSeconds: number,
  environment: Readonly<Record<string, string | undefined>>
): Readonly<{ rawBody: Buffer; headers: Readonly<Record<string, string>> }> {
  if (prepared.envelope.envelopeVersion !== 1 || prepared.envelope.algorithm !== "aes-256-gcm") {
    throw new CustomerWebhookPreparationError("UNSUPPORTED_SIGNING_ENVELOPE", false);
  }
  const actualPayloadHash = createHash("sha256").update(prepared.payloadText, "utf8").digest("base64url");
  if (actualPayloadHash !== prepared.payloadHash) {
    throw new CustomerWebhookPreparationError("EVENT_PAYLOAD_INTEGRITY_FAILED", false);
  }
  const envelope: CustomerWebhookSigningSecretEnvelope = {
    envelopeVersion: 1,
    algorithm: "aes-256-gcm",
    keyVersion: prepared.envelope.keyVersion,
    iv: prepared.envelope.iv,
    ciphertext: prepared.envelope.ciphertext,
    authTag: prepared.envelope.authTag,
    fingerprint: prepared.envelope.fingerprint
  };
  const secret = decryptCustomerWebhookSigningSecret({
    envelope,
    masterKey: readCustomerWebhookSecretsMasterKey(environment),
    binding: {
      orgId: prepared.orgId,
      endpointId: prepared.endpointId,
      subscriptionId: prepared.subscriptionId,
      secretId: prepared.secretId,
      secretVersion: prepared.secretVersion
    }
  });
  const rawBody = Buffer.from(prepared.payloadText, "utf8");
  const signature = signCustomerWebhookPayload({ secret, timestampSeconds, rawBody });
  return Object.freeze({
    rawBody,
    headers: Object.freeze({
      "X-SignalStack-Event-Id": prepared.eventId,
      "X-SignalStack-Delivery-Id": prepared.deliveryId,
      "X-SignalStack-Event-Type": prepared.eventType,
      "X-SignalStack-Timestamp": timestampSeconds.toString(),
      "X-SignalStack-Secret-Version": prepared.secretVersion.toString(),
      "X-SignalStack-Signature": signature,
      "User-Agent": CUSTOMER_WEBHOOK_USER_AGENT
    })
  });
}

function classifyPreparationFailure(
  prepared: PreparedCustomerWebhookDelivery,
  error: unknown,
  nowMilliseconds: number
): Readonly<{ decision: CustomerWebhookAttemptDecision; errorCode: string }> {
  if (error instanceof CustomerWebhookPreparationError) {
    return Object.freeze({
      decision: error.retryable
        ? retryDecision(prepared, "network", nowMilliseconds)
        : permanentFailureDecision(),
      errorCode: error.code
    });
  }
  if (error instanceof CustomerWebhookSigningSecretError) {
    if (error.code === "INVALID_MASTER_KEY") {
      return Object.freeze({
        decision: retryDecision(prepared, "network", nowMilliseconds),
        errorCode: "SIGNING_KEY_UNAVAILABLE"
      });
    }
    return Object.freeze({ decision: permanentFailureDecision(), errorCode: "SIGNING_SECRET_DECRYPTION_FAILED" });
  }
  return Object.freeze({
    decision: retryDecision(prepared, "network", nowMilliseconds),
    errorCode: "DELIVERY_PREPARATION_FAILED"
  });
}

function classifyTransportFailure(
  prepared: PreparedCustomerWebhookDelivery,
  error: unknown,
  nowMilliseconds: number
): Readonly<{ decision: CustomerWebhookAttemptDecision; errorCode: string }> {
  if (error instanceof CustomerWebhookTransportError) {
    if (error.code === "INVALID_REQUEST" || error.code === "RESPONSE_TOO_LARGE") {
      return Object.freeze({ decision: permanentFailureDecision(), errorCode: error.code });
    }
    return Object.freeze({
      decision: retryOrDisableDecision(prepared, transportFailure(error), nowMilliseconds),
      errorCode: error.code
    });
  }
  return Object.freeze({
    decision: retryDecision(prepared, "network", nowMilliseconds),
    errorCode: "NETWORK_ERROR"
  });
}

function retryOrDisableDecision(
  prepared: PreparedCustomerWebhookDelivery,
  failure: CustomerWebhookTransportFailureKind,
  nowMilliseconds: number
): CustomerWebhookAttemptDecision {
  return classifyCustomerWebhookAttempt({
    attemptNumber: prepared.attemptNumber,
    maxAttempts: prepared.maxAttempts,
    transportFailure: failure,
    nowMilliseconds
  });
}

function retryDecision(
  prepared: PreparedCustomerWebhookDelivery,
  failure: Exclude<CustomerWebhookTransportFailureKind, "unsafe-endpoint">,
  nowMilliseconds: number
): CustomerWebhookAttemptDecision {
  return retryOrDisableDecision(prepared, failure, nowMilliseconds);
}

function permanentFailureDecision(): CustomerWebhookAttemptDecision {
  return Object.freeze({
    outcome: "failed",
    reason: "permanent-status",
    retryDelaySeconds: null,
    retryAfterAccepted: false
  });
}

function transportFailure(error: CustomerWebhookTransportError): CustomerWebhookTransportFailureKind {
  if (error.code === "UNSAFE_ENDPOINT") return "unsafe-endpoint";
  if (error.code === "DNS_TIMEOUT" || error.code === "REQUEST_TIMEOUT" || error.code === "RESPONSE_TIMEOUT") {
    return "timeout";
  }
  return "network";
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!(rows[0]?.now instanceof Date) || !Number.isFinite(rows[0].now.getTime())) {
    throw new Error("Customer webhook database clock is unavailable.");
  }
  return rows[0].now;
}

function assertCustomerWebhookDeliveryClaim(claim: CustomerWebhookDeliveryClaim): void {
  if (
    !claim ||
    !isIdentifier(claim.deliveryId) ||
    !isIdentifier(claim.expectedOrgId) ||
    !isProcessingToken(claim.processingToken)
  ) {
    throw new Error("Customer webhook delivery claim is invalid.");
  }
}

function assertPreparedDeliveryMatchesClaim(
  claim: CustomerWebhookDeliveryClaim,
  prepared: PreparedCustomerWebhookDelivery
): void {
  if (
    !prepared ||
    prepared.orgId !== claim.expectedOrgId ||
    prepared.deliveryId !== claim.deliveryId ||
    !isIdentifier(prepared.endpointId) ||
    !isIdentifier(prepared.subscriptionId) ||
    !isIdentifier(prepared.eventId) ||
    !isIdentifier(prepared.secretId) ||
    !isIdentifier(prepared.attemptId) ||
    !Number.isSafeInteger(prepared.secretVersion) ||
    prepared.secretVersion < 1 ||
    !Number.isSafeInteger(prepared.generation) ||
    prepared.generation < 1 ||
    !Number.isSafeInteger(prepared.attemptNumber) ||
    !Number.isSafeInteger(prepared.maxAttempts) ||
    prepared.attemptNumber < 1 ||
    prepared.maxAttempts < prepared.attemptNumber ||
    prepared.maxAttempts > 12 ||
    !(prepared.requestTimestamp instanceof Date) ||
    !Number.isFinite(prepared.requestTimestamp.getTime()) ||
    prepared.requestTimestamp.getMilliseconds() !== 0 ||
    !(prepared.startedAt instanceof Date) ||
    !Number.isFinite(prepared.startedAt.getTime()) ||
    prepared.requestTimestamp.getTime() > prepared.startedAt.getTime() ||
    prepared.startedAt.getTime() - prepared.requestTimestamp.getTime() >= 1_000
  ) {
    throw new Error("Prepared customer webhook delivery does not match its claim.");
  }
}

function assertFinalizationEvidence(evidence: CustomerWebhookFinalizationEvidence): void {
  if (
    !evidence ||
    !(evidence.requestTimestamp instanceof Date) ||
    !Number.isFinite(evidence.requestTimestamp.getTime()) ||
    (evidence.statusCode !== undefined &&
      (!Number.isSafeInteger(evidence.statusCode) || evidence.statusCode < 100 || evidence.statusCode > 599)) ||
    (evidence.errorCode !== undefined && !/^[A-Z][A-Z0-9_]{0,63}$/.test(evidence.errorCode))
  ) {
    throw new Error("Customer webhook finalization evidence is invalid.");
  }
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

class CustomerWebhookPreparationError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super("Customer webhook request preparation failed.");
    this.name = "CustomerWebhookPreparationError";
  }
}

export async function runContinuousCustomerWebhookWorker(
  input: Readonly<{
    pollIntervalMs: number;
    maxDeliveriesPerPoll: number;
    maxIterations?: number;
    shouldContinue?: () => boolean;
    onResult?: (result: CustomerWebhookWorkerRunResult, iteration: number) => void;
  }>,
  dependencies: Readonly<{
    processDue?: typeof processDueCustomerWebhookDeliveries;
    sleep?: (milliseconds: number) => Promise<void>;
  }> = {}
): Promise<void> {
  if (
    input.maxIterations !== undefined &&
    (!Number.isSafeInteger(input.maxIterations) || input.maxIterations < 1)
  ) {
    throw new Error("Customer webhook worker maximum iterations is invalid.");
  }
  let iteration = 0;
  while (input.shouldContinue?.() ?? true) {
    iteration += 1;
    try {
      const result = await (dependencies.processDue ?? processDueCustomerWebhookDeliveries)(
        input.maxDeliveriesPerPoll
      );
      input.onResult?.(result, iteration);
    } catch (error) {
      logger.error("customer_webhook_worker_iteration_failed", {
        iteration,
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
    }
    if (
      (input.maxIterations !== undefined && iteration >= input.maxIterations) ||
      !(input.shouldContinue?.() ?? true)
    ) {
      break;
    }
    await (dependencies.sleep ?? sleep)(input.pollIntervalMs);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
