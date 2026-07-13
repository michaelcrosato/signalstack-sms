import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus,
  type Prisma
} from "@prisma/client";
import {
  claimDueMessageAttempts,
  recoverExpiredMessageAttempts,
  type MessageAttemptClaim,
  type RecoveredMessageAttempt
} from "@/lib/db/message-attempt-dispatch";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import {
  createProviderSendAdapter,
  type ProviderSendCredentialSnapshot
} from "@/lib/messaging/outbox/provider-runtime";
import {
  decideDirectMessageCreateError,
  decideDirectMessageCreateResult,
  type DirectMessageAttemptDecision
} from "@/lib/messaging/outbox/policy";
import {
  directMessageWorkerReadiness,
  type DirectMessageWorkerReadinessInput
} from "@/lib/messaging/outbox/readiness";
import { createDummyProvider } from "@/lib/messaging/provider/dummy-provider";
import type {
  ProviderAdapter,
  ProviderMessageCreateResult
} from "@/lib/messaging/provider/types";
import { createMessageStatusCallbackUrl } from "@/lib/messaging/status-callback-correlation";
import { logger } from "@/lib/observability/logger";

export type PreparedDirectMessageAttempt = Readonly<{
  orgId: string;
  attemptId: string;
  messageId: string;
  attemptNumber: number;
  processingToken: string;
  transport: MessageTransport;
  providerCallStartedAt: Date | null;
  providerSnapshot: ProviderSendCredentialSnapshot | null;
  providerPhoneNumberId: string | null;
  from: string;
  destination: string;
  body: string;
  mediaUrls: readonly string[];
  requestFingerprint: string;
  callbackCorrelationId: string;
  statusCallbackUrl: string | null;
}>;

export type PrepareDirectMessageAttemptResult =
  | Readonly<{ outcome: "prepared"; prepared: PreparedDirectMessageAttempt }>
  | Readonly<{ outcome: "cancelled" | "skipped" }>;

export type DirectMessageClaimOutcome =
  | "sent"
  | "delivered"
  | "retried"
  | "failed"
  | "ambiguous"
  | "cancelled"
  | "skipped";

export type DirectMessageWorkerRunResult = Readonly<{
  recovered: number;
  claimed: number;
  sent: number;
  delivered: number;
  retried: number;
  failed: number;
  ambiguous: number;
  cancelled: number;
  skipped: number;
  blocked: boolean;
  reason?: string;
}>;

type TenantTransactionRunner = <T>(
  context: Readonly<{ orgId: string }>,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) => Promise<T>;

export async function processDueDirectMessageAttempts(
  maxAttempts = 25,
  dependencies: Readonly<{
    readiness?: () => ReturnType<typeof directMessageWorkerReadiness>;
    recover?: typeof recoverExpiredMessageAttempts;
    claim?: typeof claimDueMessageAttempts;
    processClaim?: (claim: MessageAttemptClaim) => Promise<DirectMessageClaimOutcome>;
    recordRecovery?: (recovered: RecoveredMessageAttempt) => Promise<void>;
  }> = {}
): Promise<DirectMessageWorkerRunResult> {
  const readiness = (dependencies.readiness ?? currentDirectMessageWorkerReadiness)();
  const counts = {
    sent: 0,
    delivered: 0,
    retried: 0,
    failed: 0,
    ambiguous: 0,
    cancelled: 0,
    skipped: 0
  };
  const recoveryAuthorized = readiness.allowed || readiness.reason === "live-worker-invalid";
  if (!recoveryAuthorized) {
    return Object.freeze({
      recovered: 0,
      claimed: 0,
      ...counts,
      blocked: true,
      reason: readiness.reason
    });
  }

  const recovered = await (dependencies.recover ?? recoverExpiredMessageAttempts)(maxAttempts);
  for (const item of recovered) {
    try {
      await (dependencies.recordRecovery ?? recordRecoveredDirectMessageAmbiguity)(item);
    } catch (error) {
      logger.error("direct_message_recovery_event_failed", {
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
    }
  }
  // An explicitly enabled worker process may make expired post-frontier uncertainty visible even
  // while its live provider configuration is invalid. It still cannot claim or call the provider.
  if (!readiness.allowed) {
    return Object.freeze({
      recovered: recovered.length,
      claimed: 0,
      ...counts,
      blocked: true,
      reason: readiness.reason
    });
  }
  const claims = await (dependencies.claim ?? claimDueMessageAttempts)(maxAttempts);
  for (const claim of claims) {
    try {
      const outcome = await (dependencies.processClaim ?? processClaimedDirectMessageAttempt)(claim);
      counts[outcome] += 1;
    } catch (error) {
      counts.skipped += 1;
      logger.error("direct_message_attempt_processing_failed", {
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
    }
  }
  return Object.freeze({
    recovered: recovered.length,
    claimed: claims.length,
    ...counts,
    blocked: false
  });
}

export async function runContinuousDirectMessageWorker(input: Readonly<{
  pollIntervalMs: number;
  maxAttemptsPerPoll: number;
  maxIterations?: number;
  shouldContinue?: () => boolean;
  onResult?: (result: DirectMessageWorkerRunResult, iteration: number) => void;
}>): Promise<void> {
  const pollIntervalMs = Math.max(1_000, Math.trunc(input.pollIntervalMs));
  const shouldContinue = input.shouldContinue ?? (() => true);
  let iteration = 0;
  while (shouldContinue() && (input.maxIterations === undefined || iteration < input.maxIterations)) {
    iteration += 1;
    const result = await processDueDirectMessageAttempts(input.maxAttemptsPerPoll);
    input.onResult?.(result, iteration);
    if (shouldContinue() && (input.maxIterations === undefined || iteration < input.maxIterations)) {
      await sleep(pollIntervalMs);
    }
  }
}

export async function processClaimedDirectMessageAttempt(
  claim: MessageAttemptClaim,
  dependencies: Readonly<{
    prepare?: (claim: MessageAttemptClaim) => Promise<PrepareDirectMessageAttemptResult>;
    createAdapter?: (prepared: PreparedDirectMessageAttempt) => ProviderAdapter;
    now?: () => Date;
    finalize?: (
      claim: MessageAttemptClaim,
      prepared: PreparedDirectMessageAttempt,
      decision: DirectMessageAttemptDecision
    ) => Promise<boolean>;
    markPersistenceAmbiguous?: (
      claim: MessageAttemptClaim,
      prepared: PreparedDirectMessageAttempt
    ) => Promise<boolean>;
  }> = {}
): Promise<DirectMessageClaimOutcome> {
  assertClaim(claim);
  const preparedResult = await (dependencies.prepare ?? prepareClaimedDirectMessageAttempt)(claim);
  if (preparedResult.outcome !== "prepared") return preparedResult.outcome;
  const prepared = preparedResult.prepared;
  assertPreparedMatchesClaim(claim, prepared);

  let adapter: ProviderAdapter;
  let decision: DirectMessageAttemptDecision;
  try {
    adapter = (dependencies.createAdapter ?? createAdapterForPreparedAttempt)(prepared);
  } catch {
    decision = Object.freeze({
      outcome: "ambiguous",
      errorCode: "PROVIDER_CREDENTIAL_UNAVAILABLE",
      providerErrorCode: null,
      disposition: "ambiguous"
    });
    const finalized = await (dependencies.finalize ?? finalizeClaimedDirectMessageAttempt)(
      claim,
      prepared,
      decision
    );
    return finalized ? "ambiguous" : "skipped";
  }

  try {
    const result = await adapter.createMessage({
      orgId: prepared.orgId,
      to: prepared.destination,
      from: prepared.from,
      body: prepared.body,
      mediaUrls: prepared.mediaUrls,
      statusCallbackUrl: prepared.statusCallbackUrl ?? undefined,
      idempotencyKey: prepared.requestFingerprint
    });
    decision = providerCreateResultMatchesPrepared(result, prepared)
      ? decideDirectMessageCreateResult(result)
      : Object.freeze({
          outcome: "ambiguous" as const,
          errorCode: "PROVIDER_RESPONSE_MISMATCH",
          providerErrorCode: null,
          disposition: "ambiguous" as const
        });
  } catch (error) {
    decision = decideDirectMessageCreateError({
      adapter,
      error,
      attemptNumber: prepared.attemptNumber,
      now: dependencies.now?.() ?? new Date()
    });
  }

  try {
    const finalized = await (dependencies.finalize ?? finalizeClaimedDirectMessageAttempt)(
      claim,
      prepared,
      decision
    );
    return finalized ? outcomeFromDecision(decision) : "skipped";
  } catch (error) {
    try {
      const marked = await (
        dependencies.markPersistenceAmbiguous ?? markDirectMessageResultPersistenceAmbiguous
      )(claim, prepared);
      if (marked) return "ambiguous";
    } catch (markError) {
      logger.error("direct_message_result_persistence_ambiguous", {
        errorType: markError instanceof Error ? markError.name : "UnknownError"
      });
    }
    throw error;
  }
}

export async function prepareClaimedDirectMessageAttempt(
  claim: MessageAttemptClaim,
  dependencies: Readonly<{
    transaction?: TenantTransactionRunner;
    environment?: Readonly<Record<string, string | undefined>>;
  }> = {}
): Promise<PrepareDirectMessageAttemptResult> {
  assertClaim(claim);
  const transaction = dependencies.transaction ?? withTenantTransaction;
  const environment = dependencies.environment ?? process.env;
  return transaction({ orgId: claim.expectedOrgId }, async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "MessageAttempt"
      WHERE "orgId" = ${claim.expectedOrgId} AND id = ${claim.attemptId}
      FOR UPDATE
    `;
    let candidate = await tx.messageAttempt.findFirst({
      where: {
        id: claim.attemptId,
        orgId: claim.expectedOrgId,
        status: MessageAttemptStatus.PROCESSING,
        processingToken: claim.processingToken,
        completedAt: null,
        providerCallStartedAt: null
      },
      include: { message: true }
    });
    if (!candidate) return Object.freeze({ outcome: "skipped" as const });

    await tx.$queryRaw`
      SELECT id FROM "Message"
      WHERE "orgId" = ${claim.expectedOrgId} AND id = ${candidate.messageId}
      FOR UPDATE
    `;
    candidate = await tx.messageAttempt.findFirst({
      where: {
        id: claim.attemptId,
        orgId: claim.expectedOrgId,
        status: MessageAttemptStatus.PROCESSING,
        processingToken: claim.processingToken,
        completedAt: null,
        providerCallStartedAt: null
      },
      include: { message: true }
    });
    if (!candidate || candidate.message.applicationStatus !== MessageApplicationStatus.PROCESSING) {
      return Object.freeze({ outcome: "skipped" as const });
    }
    const now = await databaseNow(tx);
    if (!acceptedPayloadMatchesAttempt(candidate)) {
      await cancelClaimedAttempt(tx, candidate, now, "ACCEPTED_PAYLOAD_MISMATCH");
      return Object.freeze({ outcome: "cancelled" as const });
    }
    if (candidate.message.contactId) {
      await tx.$queryRaw`
        SELECT id FROM "Contact"
        WHERE "orgId" = ${claim.expectedOrgId} AND id = ${candidate.message.contactId}
        FOR SHARE
      `;
    }
    if (candidate.providerAccountId) {
      await tx.$queryRaw`
        SELECT id FROM "ProviderAccount"
        WHERE "orgId" = ${claim.expectedOrgId} AND id = ${candidate.providerAccountId}
        FOR SHARE
      `;
    }
    if (candidate.providerPhoneNumberId) {
      await tx.$queryRaw`
        SELECT id FROM "ProviderPhoneNumber"
        WHERE "orgId" = ${claim.expectedOrgId} AND id = ${candidate.providerPhoneNumberId}
        FOR SHARE
      `;
    }
    await tx.$queryRaw`
      SELECT id FROM "Organization"
      WHERE id = ${claim.expectedOrgId}
      FOR SHARE
    `;
    if (!candidate.processingExpiresAt || candidate.processingExpiresAt.getTime() <= now.getTime()) {
      return Object.freeze({ outcome: "skipped" as const });
    }

    const contact = candidate.message.contactId
      ? await tx.contact.findFirst({
          where: { orgId: claim.expectedOrgId, id: candidate.message.contactId }
        })
      : null;
    const organization = await tx.organization.findFirst({
      where: { id: claim.expectedOrgId },
      select: { timezone: true, demoMode: true }
    });
    if (!contact || !organization || contact.phone !== candidate.destination) {
      await cancelClaimedAttempt(tx, candidate, now, "CONTACT_NOT_AVAILABLE");
      return Object.freeze({ outcome: "cancelled" as const });
    }

    if (candidate.transport === MessageTransport.DUMMY) {
      if (contact.archivedAt || contact.optedOutAt || contact.consentStatus === "OPTED_OUT") {
        await cancelClaimedAttempt(tx, candidate, now, "RECIPIENT_BLOCKED");
        return Object.freeze({ outcome: "cancelled" as const });
      }
      return Object.freeze({
        outcome: "prepared" as const,
        prepared: preparedAttempt(candidate, claim, {
          providerCallStartedAt: null,
          providerSnapshot: null,
          from: "+15555550199"
        })
      });
    }

    const liveWorkerReadiness = directMessageWorkerReadiness(
      readinessInputFromEnvironment(environment)
    );
    if (!liveWorkerReadiness.allowed || liveWorkerReadiness.transport !== "twilio") {
      await cancelClaimedAttempt(tx, candidate, now, "LIVE_WORKER_NOT_AUTHORIZED");
      return Object.freeze({ outcome: "cancelled" as const });
    }
    await tx.$queryRaw`
      SELECT id FROM "ComplianceProfile"
      WHERE "orgId" = ${claim.expectedOrgId}
      FOR SHARE
    `;
    const complianceProfile = await tx.complianceProfile.findUnique({
      where: { orgId: claim.expectedOrgId }
    });
    const gate = evaluateMessagingHardGate({
      demoMode: environment.DEMO_MODE === "true" || organization.demoMode,
      liveMessagingEnabled: environment.LIVE_MESSAGING_ENABLED === "true",
      messagingProvider: environment.MESSAGING_PROVIDER ?? "dummy",
      complianceProfile,
      contact: {
        phone: candidate.destination,
        consentStatus: contact.consentStatus,
        optedOutAt: contact.optedOutAt,
        archivedAt: contact.archivedAt,
        consentCapturedAt: contact.consentCapturedAt,
        consentMethod: contact.consentMethod,
        consentDisclosure: contact.consentDisclosure
      },
      quietHours: { now, timeZone: organization.timezone }
    });
    if (!gate.allowed) {
      await cancelClaimedAttempt(tx, candidate, now, "MESSAGING_HARD_GATE_BLOCKED");
      return Object.freeze({ outcome: "cancelled" as const });
    }

    if (!candidate.providerAccountId || !candidate.providerPhoneNumberId) {
      await cancelClaimedAttempt(tx, candidate, now, "PROVIDER_BINDING_UNAVAILABLE");
      return Object.freeze({ outcome: "cancelled" as const });
    }
    const [account, sender, secret] = await Promise.all([
      tx.providerAccount.findFirst({
        where: {
          orgId: claim.expectedOrgId,
          id: candidate.providerAccountId,
          provider: "twilio",
          status: ProviderAccountStatus.VERIFIED,
          revokedAt: null
        }
      }),
      tx.providerPhoneNumber.findFirst({
        where: {
          orgId: claim.expectedOrgId,
          id: candidate.providerPhoneNumberId,
          provider: "twilio",
          providerAccountId: candidate.providerAccountId,
          status: ProviderPhoneNumberStatus.VERIFIED,
          disabledAt: null
        }
      }),
      tx.providerCredentialSecret.findFirst({
        where: {
          orgId: claim.expectedOrgId,
          providerAccountId: candidate.providerAccountId,
          activeFrom: { lte: now },
          retiredAt: null
        },
        orderBy: { version: "desc" }
      })
    ]);
    if (!account || !sender || !secret || !senderCapabilityAllows(sender.capabilities, candidate.mediaUrls)) {
      await cancelClaimedAttempt(tx, candidate, now, "PROVIDER_AUTHORITY_UNAVAILABLE");
      return Object.freeze({ outcome: "cancelled" as const });
    }
    const lockedSecrets = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ProviderCredentialSecret"
      WHERE "orgId" = ${claim.expectedOrgId}
        AND "providerAccountId" = ${account.id}
        AND id = ${secret.id}
        AND "activeFrom" <= ${now}
        AND "retiredAt" IS NULL
      FOR SHARE
    `;
    if (lockedSecrets.length !== 1) {
      await cancelClaimedAttempt(tx, candidate, now, "PROVIDER_AUTHORITY_UNAVAILABLE");
      return Object.freeze({ outcome: "cancelled" as const });
    }
    const providerSnapshot: ProviderSendCredentialSnapshot = Object.freeze({
      orgId: claim.expectedOrgId,
      provider: "twilio",
      providerAccountId: account.id,
      externalAccountId: account.externalAccountId,
      externalAccountIdHash: account.externalAccountIdHash,
      providerCredentialSecretId: secret.id,
      providerCredentialVersion: secret.version,
      secret: Object.freeze({
        envelopeVersion: secret.envelopeVersion,
        algorithm: secret.algorithm,
        keyVersion: secret.keyVersion,
        iv: secret.iv,
        ciphertext: secret.ciphertext,
        authTag: secret.authTag,
        fingerprint: secret.fingerprint
      })
    });
    let statusCallbackUrl: string;
    try {
      statusCallbackUrl = createMessageStatusCallbackUrl({
        appUrl: environment.NEXT_PUBLIC_APP_URL ?? "",
        orgId: claim.expectedOrgId,
        attemptId: candidate.id,
        correlationId: candidate.callbackCorrelationId,
        masterKey: environment.SECRETS_MASTER_KEY ?? ""
      });
    } catch {
      await cancelClaimedAttempt(tx, candidate, now, "CALLBACK_AUTHORITY_UNAVAILABLE");
      return Object.freeze({ outcome: "cancelled" as const });
    }
    const started = await tx.messageAttempt.updateMany({
      where: {
        id: candidate.id,
        orgId: claim.expectedOrgId,
        status: MessageAttemptStatus.PROCESSING,
        processingToken: claim.processingToken,
        providerCallStartedAt: null,
        completedAt: null,
        processingExpiresAt: { gt: now }
      },
      data: {
        providerCredentialSecretId: secret.id,
        providerCredentialVersion: secret.version,
        providerCallStartedAt: now
      }
    });
    if (started.count !== 1) return Object.freeze({ outcome: "skipped" as const });

    return Object.freeze({
      outcome: "prepared" as const,
      prepared: preparedAttempt(candidate, claim, {
        providerCallStartedAt: now,
        providerSnapshot,
        from: sender.phoneNumber,
        statusCallbackUrl
      })
    });
  });
}

export async function finalizeClaimedDirectMessageAttempt(
  claim: MessageAttemptClaim,
  prepared: PreparedDirectMessageAttempt,
  decision: DirectMessageAttemptDecision,
  dependencies: Readonly<{
    transaction?: TenantTransactionRunner;
    randomId?: () => string;
  }> = {}
): Promise<boolean> {
  assertClaim(claim);
  assertPreparedMatchesClaim(claim, prepared);
  const transaction = dependencies.transaction ?? withTenantTransaction;
  return transaction({ orgId: claim.expectedOrgId }, async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "MessageAttempt"
      WHERE "orgId" = ${claim.expectedOrgId} AND id = ${claim.attemptId}
      FOR UPDATE
    `;
    const attempt = await tx.messageAttempt.findFirst({
      where: {
        id: claim.attemptId,
        orgId: claim.expectedOrgId,
        messageId: prepared.messageId,
        attemptNumber: prepared.attemptNumber,
        status: MessageAttemptStatus.PROCESSING,
        processingToken: claim.processingToken,
        completedAt: null,
        ...(prepared.transport === MessageTransport.TWILIO
          ? { providerCallStartedAt: prepared.providerCallStartedAt }
          : { providerCallStartedAt: null })
      },
      include: { message: true }
    });
    if (!attempt) return false;
    await tx.$queryRaw`
      SELECT id FROM "Message"
      WHERE "orgId" = ${claim.expectedOrgId} AND id = ${attempt.messageId}
      FOR UPDATE
    `;
    const message = await tx.message.findFirst({
      where: {
        id: attempt.messageId,
        orgId: claim.expectedOrgId,
        applicationStatus: MessageApplicationStatus.PROCESSING
      }
    });
    if (!message) return false;
    const now = await databaseNow(tx);

    if (decision.outcome === "retry") {
      const retryDueAt = new Date(
        Math.max(decision.nextAttemptAt.getTime(), now.getTime())
      );
      if (!Number.isFinite(retryDueAt.getTime())) {
        throw new Error("Direct-message retry deadline is invalid.");
      }
      const successorCorrelationId = (dependencies.randomId ?? randomUUID)();
      if (!isUuidV4(successorCorrelationId)) {
        throw new Error("Direct-message retry correlation is invalid.");
      }
      await closeAttempt(tx, attempt.id, {
        status: MessageAttemptStatus.FAILED,
        errorCode: decision.errorCode,
        providerErrorCode: decision.providerErrorCode,
        disposition: decision.disposition,
        completedAt: now
      });
      await tx.messageAttempt.create({
        data: {
          orgId: attempt.orgId,
          messageId: attempt.messageId,
          attemptNumber: attempt.attemptNumber + 1,
          retryOfAttemptId: attempt.id,
          status: MessageAttemptStatus.QUEUED,
          transport: attempt.transport,
          dueAt: retryDueAt,
          providerAccountId: attempt.providerAccountId,
          providerPhoneNumberId: attempt.providerPhoneNumberId,
          destination: attempt.destination,
          body: attempt.body,
          mediaUrls: attempt.mediaUrls,
          requestFingerprint: attempt.requestFingerprint,
          callbackCorrelationId: successorCorrelationId,
          createdAt: now,
          updatedAt: now
        }
      });
      await tx.message.update({
        where: { id: attempt.messageId },
        data: {
          applicationStatus: MessageApplicationStatus.SCHEDULED,
          scheduledAt: retryDueAt,
          attemptCount: attempt.attemptNumber + 1,
          providerErrorCode: decision.providerErrorCode
        }
      });
      await enqueueMessageLifecycleEvents(tx, message, "scheduled", {
        attemptNumber: attempt.attemptNumber + 1,
        providerStatus: null,
        providerErrorCode: decision.providerErrorCode
      });
      return true;
    }

    if (decision.outcome === "ambiguous") {
      await closeAttempt(tx, attempt.id, {
        status: MessageAttemptStatus.AMBIGUOUS,
        errorCode: decision.errorCode,
        providerErrorCode: decision.providerErrorCode,
        disposition: decision.disposition,
        completedAt: now
      });
      await tx.message.update({
        where: { id: attempt.messageId },
        data: {
          applicationStatus: MessageApplicationStatus.AMBIGUOUS,
          ambiguousAt: message.ambiguousAt ?? now,
          providerErrorCode: decision.providerErrorCode
        }
      });
      await enqueueMessageLifecycleEvents(tx, message, "ambiguous", {
        attemptNumber: attempt.attemptNumber,
        providerStatus: null,
        providerErrorCode: decision.providerErrorCode
      });
      return true;
    }

    if (decision.outcome === "failed") {
      const result = decision.result;
      await closeAttempt(tx, attempt.id, {
        status: MessageAttemptStatus.FAILED,
        providerMessageId: result?.providerMessageId,
        providerStatus: result?.status.providerStatus,
        errorCode: decision.errorCode,
        providerErrorCode: decision.providerErrorCode,
        disposition: decision.disposition,
        completedAt: now
      });
      await tx.message.update({
        where: { id: attempt.messageId },
        data: {
          applicationStatus: MessageApplicationStatus.FAILED,
          failedAt: now,
          providerMessageId: result?.providerMessageId,
          providerErrorCode: decision.providerErrorCode,
          providerStatus: result?.status.providerStatus ?? null
        }
      });
      await enqueueMessageLifecycleEvents(tx, message, "failed", {
        attemptNumber: attempt.attemptNumber,
        providerStatus: result?.status.providerStatus ?? null,
        providerErrorCode: decision.providerErrorCode
      });
      return true;
    }

    const result = decision.result;
    const delivered = decision.outcome === "delivered";
    await closeAttempt(tx, attempt.id, {
      status: MessageAttemptStatus.SUCCEEDED,
      providerMessageId: result.providerMessageId,
      providerStatus: result.status.providerStatus,
      providerErrorCode: result.providerErrorCode,
      errorCode: null,
      disposition: "success",
      completedAt: now
    });
    await tx.message.update({
      where: { id: attempt.messageId },
      data: {
        applicationStatus: delivered
          ? MessageApplicationStatus.DELIVERED
          : MessageApplicationStatus.SENT,
        providerMessageId: result.providerMessageId,
        providerStatus: result.status.providerStatus,
        providerErrorCode: result.providerErrorCode,
        sentAt: message.sentAt ?? now,
        deliveredAt: delivered ? now : message.deliveredAt,
        failedAt: null
      }
    });
    await enqueueMessageLifecycleEvents(tx, message, delivered ? "delivered" : "sent", {
      attemptNumber: attempt.attemptNumber,
      providerStatus: result.status.providerStatus,
      providerErrorCode: result.providerErrorCode
    });
    return true;
  });
}

export async function markDirectMessageResultPersistenceAmbiguous(
  claim: MessageAttemptClaim,
  prepared: PreparedDirectMessageAttempt,
  dependencies: Readonly<{ transaction?: TenantTransactionRunner }> = {}
): Promise<boolean> {
  assertClaim(claim);
  assertPreparedMatchesClaim(claim, prepared);
  return (dependencies.transaction ?? withTenantTransaction)(
    { orgId: claim.expectedOrgId },
    async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "MessageAttempt"
        WHERE "orgId" = ${claim.expectedOrgId} AND id = ${claim.attemptId}
        FOR UPDATE
      `;
      const attempt = await tx.messageAttempt.findFirst({
        where: {
          id: claim.attemptId,
          orgId: claim.expectedOrgId,
          messageId: prepared.messageId,
          status: MessageAttemptStatus.PROCESSING,
          processingToken: claim.processingToken,
          providerCallStartedAt: prepared.providerCallStartedAt,
          completedAt: null
        }
      });
      if (!attempt) return false;
      await tx.$queryRaw`
        SELECT id FROM "Message"
        WHERE "orgId" = ${claim.expectedOrgId} AND id = ${attempt.messageId}
        FOR UPDATE
      `;
      const message = await tx.message.findFirst({
        where: {
          id: attempt.messageId,
          orgId: claim.expectedOrgId,
          applicationStatus: MessageApplicationStatus.PROCESSING
        }
      });
      if (!message) return false;
      const now = await databaseNow(tx);
      await closeAttempt(tx, attempt.id, {
        status: MessageAttemptStatus.AMBIGUOUS,
        errorCode: "PROVIDER_RESULT_PERSISTENCE_UNCERTAIN",
        providerErrorCode: null,
        disposition: "ambiguous",
        completedAt: now
      });
      await tx.message.update({
        where: { id: attempt.messageId },
        data: {
          applicationStatus: MessageApplicationStatus.AMBIGUOUS,
          ambiguousAt: message.ambiguousAt ?? now
        }
      });
      return true;
    }
  );
}

export async function recordRecoveredDirectMessageAmbiguity(
  recovered: RecoveredMessageAttempt
): Promise<void> {
  await withTenantTransaction({ orgId: recovered.expectedOrgId }, async (tx) => {
    const attempt = await tx.messageAttempt.findFirst({
      where: {
        id: recovered.attemptId,
        orgId: recovered.expectedOrgId,
        status: MessageAttemptStatus.AMBIGUOUS
      },
      include: { message: true }
    });
    if (!attempt) return;
    await enqueueMessageLifecycleEvents(tx, attempt.message, "ambiguous", {
      attemptNumber: attempt.attemptNumber,
      providerStatus: attempt.providerStatus,
      providerErrorCode: attempt.providerErrorCode
    });
  });
}

function currentDirectMessageWorkerReadiness() {
  return directMessageWorkerReadiness(readinessInputFromEnvironment(process.env));
}

function readinessInputFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): DirectMessageWorkerReadinessInput {
  return {
    workerEnabled: environment.WORKER_ENABLED,
    workerDeploymentClass: environment.WORKER_DEPLOYMENT_CLASS,
    runtimeProcess: environment.RUNTIME_PROCESS,
    demoMode: environment.DEMO_MODE,
    liveMessagingEnabled: environment.LIVE_MESSAGING_ENABLED,
    messagingProvider: environment.MESSAGING_PROVIDER,
    appUrl: environment.NEXT_PUBLIC_APP_URL,
    secretsMasterKey: environment.SECRETS_MASTER_KEY,
    nodeEnv: environment.NODE_ENV,
    vercelEnv: environment.VERCEL_ENV,
    deploymentEnv: environment.DEPLOYMENT_ENV,
    appEnv: environment.APP_ENV
  };
}

function createAdapterForPreparedAttempt(prepared: PreparedDirectMessageAttempt): ProviderAdapter {
  return prepared.transport === MessageTransport.DUMMY
    ? createDummyProvider()
    : createProviderSendAdapter(prepared.providerSnapshot!);
}

function preparedAttempt(
  candidate: Prisma.MessageAttemptGetPayload<{ include: { message: true } }>,
  claim: MessageAttemptClaim,
  provider: Readonly<{
    providerCallStartedAt: Date | null;
    providerSnapshot: ProviderSendCredentialSnapshot | null;
    from: string;
    statusCallbackUrl?: string | null;
  }>
): PreparedDirectMessageAttempt {
  return Object.freeze({
    orgId: candidate.orgId,
    attemptId: candidate.id,
    messageId: candidate.messageId,
    attemptNumber: candidate.attemptNumber,
    processingToken: claim.processingToken,
    transport: candidate.transport,
    providerCallStartedAt: provider.providerCallStartedAt,
    providerSnapshot: provider.providerSnapshot,
    providerPhoneNumberId: candidate.providerPhoneNumberId,
    from: provider.from,
    destination: candidate.destination,
    body: candidate.body,
    mediaUrls: Object.freeze([...candidate.mediaUrls]),
    requestFingerprint: candidate.requestFingerprint,
    callbackCorrelationId: candidate.callbackCorrelationId,
    statusCallbackUrl: provider.statusCallbackUrl ?? null
  });
}

async function cancelClaimedAttempt(
  tx: Prisma.TransactionClient,
  attempt: Prisma.MessageAttemptGetPayload<{ include: { message: true } }>,
  now: Date,
  errorCode: string
): Promise<void> {
  await closeAttempt(tx, attempt.id, {
    status: MessageAttemptStatus.CANCELLED,
    errorCode,
    providerErrorCode: null,
    disposition: "terminal",
    completedAt: now
  });
  await tx.message.update({
    where: { id: attempt.messageId },
    data: {
      applicationStatus: MessageApplicationStatus.CANCELLED,
      cancelledAt: attempt.message.cancelledAt ?? now
    }
  });
  await enqueueMessageLifecycleEvents(tx, attempt.message, "cancelled", {
    attemptNumber: attempt.attemptNumber,
    providerStatus: null,
    providerErrorCode: null
  });
}

async function closeAttempt(
  tx: Prisma.TransactionClient,
  attemptId: string,
  data: Prisma.MessageAttemptUpdateInput
): Promise<void> {
  await tx.messageAttempt.update({
    where: { id: attemptId },
    data: {
      ...data,
      processingToken: null,
      processingExpiresAt: null
    }
  });
}

async function enqueueMessageLifecycleEvents(
  tx: Prisma.TransactionClient,
  message: Readonly<{
    id: string;
    orgId: string;
    contactId: string | null;
    conversationId: string | null;
  }>,
  status: "scheduled" | "sent" | "delivered" | "failed" | "cancelled" | "ambiguous",
  evidence: Readonly<{
    attemptNumber: number;
    providerStatus: string | null;
    providerErrorCode: string | null;
  }>
): Promise<void> {
  const data = {
    messageId: message.id,
    contactId: message.contactId,
    conversationId: message.conversationId,
    applicationStatus: status,
    attemptNumber: evidence.attemptNumber,
    providerStatus: evidence.providerStatus,
    providerErrorCode: evidence.providerErrorCode
  } satisfies Prisma.InputJsonObject;
  await enqueueCustomerWebhookEvent(tx, {
    orgId: message.orgId,
    deduplicationKey: `message.status.updated:${message.id}:${status}:${evidence.attemptNumber}`,
    type: "message.status.updated",
    aggregateType: "message",
    aggregateId: message.id,
    data
  });
  const specificType =
    status === "sent"
      ? "message.sent"
      : status === "delivered"
        ? "message.delivered"
        : status === "failed"
          ? "message.failed"
          : null;
  if (specificType) {
    await enqueueCustomerWebhookEvent(tx, {
      orgId: message.orgId,
      deduplicationKey: `${specificType}:${message.id}:${evidence.attemptNumber}`,
      type: specificType,
      aggregateType: "message",
      aggregateId: message.id,
      data
    });
  }
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const now = rows[0]?.now;
  if (!now || !Number.isFinite(now.getTime())) {
    throw new Error("Direct-message database clock is unavailable.");
  }
  return now;
}

function senderCapabilityAllows(value: Prisma.JsonValue, mediaUrls: readonly string[]): boolean {
  const capabilities = new Set(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase())
      : []
  );
  return capabilities.has(mediaUrls.length > 0 ? "mms" : "sms");
}

function acceptedPayloadMatchesAttempt(
  candidate: Prisma.MessageAttemptGetPayload<{ include: { message: true } }>
): boolean {
  const message = candidate.message;
  return (
    message.direction === "OUTBOUND" &&
    message.transport === candidate.transport &&
    message.destination === candidate.destination &&
    message.body === candidate.body &&
    message.requestFingerprint === candidate.requestFingerprint &&
    message.attemptCount === candidate.attemptNumber &&
    arraysEqual(message.mediaUrls, candidate.mediaUrls)
  );
}

function providerCreateResultMatchesPrepared(
  result: ProviderMessageCreateResult,
  prepared: PreparedDirectMessageAttempt
): boolean {
  if (!result || typeof result !== "object") return false;
  const expectedAccountId = prepared.providerSnapshot?.externalAccountId ?? "dummy-account";
  const expectedMessageId =
    prepared.transport === MessageTransport.DUMMY
      ? `dummy_${prepared.requestFingerprint}`
      : null;
  return (
    result.externalAccountId === expectedAccountId &&
    result.to === prepared.destination &&
    result.from === prepared.from &&
    result.messagingServiceId === null &&
    typeof result.providerMessageId === "string" &&
    result.providerMessageId.length >= 2 &&
    result.providerMessageId.length <= 191 &&
    (prepared.transport === MessageTransport.DUMMY
      ? result.providerMessageId === expectedMessageId
      : /^(?:SM|MM)[A-Fa-f0-9]{32}$/.test(result.providerMessageId)) &&
    typeof result.status?.providerStatus === "string" &&
    result.status.providerStatus.length >= 1 &&
    result.status.providerStatus.length <= 64 &&
    (result.providerErrorCode === null ||
      /^[A-Z][A-Z0-9_]{0,127}$/.test(result.providerErrorCode))
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function outcomeFromDecision(decision: DirectMessageAttemptDecision): DirectMessageClaimOutcome {
  if (decision.outcome === "retry") return "retried";
  return decision.outcome;
}

function assertClaim(claim: MessageAttemptClaim): void {
  if (
    !claim ||
    !claim.attemptId ||
    !claim.expectedOrgId ||
    !isUuidV4(claim.processingToken)
  ) {
    throw new Error("Direct-message attempt claim is invalid.");
  }
}

function assertPreparedMatchesClaim(
  claim: MessageAttemptClaim,
  prepared: PreparedDirectMessageAttempt
): void {
  if (
    prepared.orgId !== claim.expectedOrgId ||
    prepared.attemptId !== claim.attemptId ||
    prepared.processingToken !== claim.processingToken ||
    prepared.attemptNumber < 1 ||
    prepared.attemptNumber > 3 ||
    (prepared.transport === MessageTransport.DUMMY &&
      (prepared.providerCallStartedAt !== null ||
        prepared.providerSnapshot !== null ||
        prepared.providerPhoneNumberId !== null ||
        prepared.statusCallbackUrl !== null)) ||
    (prepared.transport === MessageTransport.TWILIO &&
      (!(prepared.providerCallStartedAt instanceof Date) ||
        !Number.isFinite(prepared.providerCallStartedAt.getTime()) ||
        prepared.providerSnapshot === null ||
        prepared.providerPhoneNumberId === null ||
        prepared.statusCallbackUrl === null ||
        !isUuidV4(prepared.callbackCorrelationId)))
  ) {
    throw new Error("Prepared direct-message attempt does not match its claim.");
  }
}
