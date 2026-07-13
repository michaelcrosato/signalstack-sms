import { randomUUID } from "node:crypto";
import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus,
  type Prisma
} from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { isTerminalDeliveryFailureProviderStatus } from "@/lib/messaging/delivery-status";
import { messageAttemptEventDeduplicationKey } from "@/lib/messaging/message-attempt-events";
import {
  createProviderSendAdapter,
  ProviderSendRuntimeError,
  type ProviderSendCredentialSnapshot
} from "@/lib/messaging/outbox/provider-runtime";
import { DIRECT_MESSAGE_MAX_ATTEMPTS } from "@/lib/messaging/outbox/policy";
import type { ProviderAdapter, ProviderMessageRecord } from "@/lib/messaging/provider/types";
import type { DeliveryAttemptReviewQuery } from "@/lib/validation/delivery-attempts";

const reviewAttemptSelect = {
  id: true,
  orgId: true,
  messageId: true,
  attemptNumber: true,
  status: true,
  transport: true,
  destination: true,
  dueAt: true,
  claimedAt: true,
  providerCallStartedAt: true,
  providerMessageId: true,
  providerStatus: true,
  providerErrorCode: true,
  completedAt: true,
  reconciledAt: true,
  createdAt: true,
  updatedAt: true,
  providerPhoneNumber: { select: { phoneNumber: true } },
  retries: { select: { id: true }, take: 1 },
  message: {
    select: {
      applicationStatus: true,
      providerMessageId: true,
      providerStatus: true,
      acceptedAt: true,
      scheduledAt: true,
      sentAt: true,
      deliveredAt: true,
      failedAt: true,
      cancelledAt: true,
      ambiguousAt: true
    }
  }
} satisfies Prisma.MessageAttemptSelect;

type ReviewAttempt = Prisma.MessageAttemptGetPayload<{ select: typeof reviewAttemptSelect }>;

export type DeliveryAttemptReviewDto = Readonly<{
  id: string;
  messageId: string;
  attemptNumber: number;
  applicationStatus: MessageApplicationStatus;
  attemptStatus: MessageAttemptStatus;
  transport: "dummy" | "twilio";
  providerStatus: string | null;
  providerErrorCode: string | null;
  hasProviderMessageId: boolean;
  destinationLastFour: string;
  senderLastFour: string | null;
  requiresReview: boolean;
  canReconcile: boolean;
  canAttestNotSent: boolean;
  canRetry: boolean;
  timestamps: Readonly<{
    acceptedAt: string;
    dueAt: string;
    claimedAt: string | null;
    providerCallStartedAt: string | null;
    scheduledAt: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    failedAt: string | null;
    cancelledAt: string | null;
    ambiguousAt: string | null;
    completedAt: string | null;
    reconciledAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}>;

export type DeliveryAttemptReviewErrorCode =
  | "DELIVERY_ATTEMPT_INVALID"
  | "DELIVERY_ATTEMPT_NOT_FOUND"
  | "DELIVERY_ATTEMPT_CONFLICT"
  | "DELIVERY_ATTEMPT_PROVIDER_UNAVAILABLE"
  | "DELIVERY_ATTEMPT_FETCH_FAILED";

export class DeliveryAttemptReviewError extends Error {
  readonly code: DeliveryAttemptReviewErrorCode;

  constructor(code: DeliveryAttemptReviewErrorCode) {
    super("Delivery attempt review operation failed.");
    this.name = "DeliveryAttemptReviewError";
    this.code = code;
  }
}

type ReviewDependencies = Readonly<{
  transaction?: typeof withTenantTransaction;
  createAdapter?: (snapshot: ProviderSendCredentialSnapshot) => ProviderAdapter;
  now?: () => Date;
  randomId?: () => string;
}>;

type PreparedReconciliation = Readonly<{
  orgId: string;
  attemptId: string;
  messageId: string;
  providerMessageId: string;
  destination: string;
  sender: string;
  providerAccountId: string;
  providerPhoneNumberId: string;
  credentialSecretId: string;
  credentialVersion: number;
  externalAccountId: string;
  snapshot: ProviderSendCredentialSnapshot;
}>;

export async function listDeliveryAttempts(
  orgId: string,
  query: DeliveryAttemptReviewQuery,
  dependencies: Pick<ReviewDependencies, "transaction"> = {}
): Promise<Readonly<{ attempts: readonly DeliveryAttemptReviewDto[]; nextCursor: string | null }>> {
  assertIdentifier(orgId);
  const transaction = dependencies.transaction ?? withTenantTransaction;
  return transaction({ orgId }, async (tx) => {
    let cursorBoundary: Readonly<{ id: string; createdAt: Date }> | null = null;
    if (query.cursor) {
      cursorBoundary = await tx.messageAttempt.findFirst({
        where: { orgId, id: query.cursor },
        select: { id: true, createdAt: true }
      });
      if (!cursorBoundary) throw reviewError("DELIVERY_ATTEMPT_INVALID");
    }

    const conditions: Prisma.MessageAttemptWhereInput[] = [];
    if (query.attemptStatus) conditions.push({ status: query.attemptStatus });
    if (query.requiresReview !== undefined) {
      conditions.push(
        query.requiresReview
          ? { status: MessageAttemptStatus.AMBIGUOUS }
          : { status: { not: MessageAttemptStatus.AMBIGUOUS } }
      );
    }
    if (query.applicationStatus) {
      conditions.push({ message: { is: { applicationStatus: query.applicationStatus } } });
    }
    if (cursorBoundary) {
      conditions.push({
        OR: [
          { createdAt: { lt: cursorBoundary.createdAt } },
          { createdAt: cursorBoundary.createdAt, id: { lt: cursorBoundary.id } }
        ]
      });
    }
    const rows = await tx.messageAttempt.findMany({
      where: { orgId, ...(conditions.length > 0 ? { AND: conditions } : {}) },
      select: reviewAttemptSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return Object.freeze({
      attempts: Object.freeze(page.map(projectReviewAttempt)),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null
    });
  });
}

export async function getDeliveryAttempt(
  orgId: string,
  attemptId: string,
  dependencies: Pick<ReviewDependencies, "transaction"> = {}
): Promise<DeliveryAttemptReviewDto> {
  assertIdentifier(orgId);
  assertIdentifier(attemptId);
  const transaction = dependencies.transaction ?? withTenantTransaction;
  return transaction({ orgId }, async (tx) => {
    const attempt = await tx.messageAttempt.findFirst({
      where: { orgId, id: attemptId },
      select: reviewAttemptSelect
    });
    if (!attempt) throw reviewError("DELIVERY_ATTEMPT_NOT_FOUND");
    return projectReviewAttempt(attempt);
  });
}

export async function reconcileDeliveryAttempt(
  input: Readonly<{ orgId: string; attemptId: string; actorUserId: string }>,
  dependencies: ReviewDependencies = {}
): Promise<DeliveryAttemptReviewDto> {
  assertReviewActor(input);
  const transaction = dependencies.transaction ?? withTenantTransaction;
  const now = serviceNow(dependencies);
  const prepared = await prepareReconciliation(input, transaction, now);
  let adapter: ProviderAdapter;
  try {
    adapter = (dependencies.createAdapter ?? createProviderSendAdapter)(prepared.snapshot);
  } catch (error) {
    if (error instanceof ProviderSendRuntimeError) {
      throw reviewError("DELIVERY_ATTEMPT_PROVIDER_UNAVAILABLE");
    }
    throw reviewError("DELIVERY_ATTEMPT_PROVIDER_UNAVAILABLE");
  }

  let fetched: ProviderMessageRecord;
  try {
    fetched = await adapter.fetchMessage({ providerMessageId: prepared.providerMessageId });
  } catch {
    throw reviewError("DELIVERY_ATTEMPT_FETCH_FAILED");
  }

  if (!fetchedEvidenceMatches(prepared, fetched)) {
    await recordReconciliationNoChange(input, prepared, transaction);
    return getDeliveryAttempt(input.orgId, input.attemptId, { transaction });
  }

  const applicationStatus = applicationStatusFromFetched(fetched);
  const attemptStatus =
    applicationStatus === MessageApplicationStatus.FAILED
      ? MessageAttemptStatus.FAILED
      : MessageAttemptStatus.SUCCEEDED;
  await transaction({ orgId: input.orgId, userId: input.actorUserId }, async (tx) => {
    await lockReconciliationRows(tx, prepared);
    const attempt = await tx.messageAttempt.findFirst({
      where: {
        orgId: input.orgId,
        id: input.attemptId,
        messageId: prepared.messageId,
        status: MessageAttemptStatus.AMBIGUOUS,
        providerMessageId: prepared.providerMessageId,
        reconciledAt: null
      },
      include: { message: true }
    });
    if (!attempt) throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
    await assertPreparedAuthorityCurrent(tx, prepared, now);

    const attemptUpdate = await tx.messageAttempt.updateMany({
      where: {
        orgId: input.orgId,
        id: input.attemptId,
        status: MessageAttemptStatus.AMBIGUOUS,
        providerMessageId: prepared.providerMessageId,
        reconciledAt: null
      },
      data: {
        status: attemptStatus,
        providerStatus: fetched.status.providerStatus,
        providerErrorCode: fetched.providerErrorCode,
        errorCode:
          attemptStatus === MessageAttemptStatus.FAILED
            ? `PROVIDER_STATUS_${fetched.status.status.toUpperCase()}`
            : null,
        disposition:
          attemptStatus === MessageAttemptStatus.FAILED
            ? "terminal"
            : "success",
        reconciledAt: now,
        reconciledByUserId: input.actorUserId,
        reconciliationNote: `Provider fetch confirmed ${applicationStatus}.`
      }
    });
    if (attemptUpdate.count !== 1) throw reviewError("DELIVERY_ATTEMPT_CONFLICT");

    const sentAt =
      applicationStatus === MessageApplicationStatus.SENT ||
      applicationStatus === MessageApplicationStatus.DELIVERED
        ? attempt.message.sentAt ?? now
        : attempt.message.sentAt;
    const deliveredAt =
      applicationStatus === MessageApplicationStatus.DELIVERED
        ? attempt.message.deliveredAt ?? now
        : null;
    const failedAt =
      applicationStatus === MessageApplicationStatus.FAILED
        ? attempt.message.failedAt ?? now
        : null;
    const messageUpdate = await tx.message.updateMany({
      where: {
        orgId: input.orgId,
        id: prepared.messageId,
        applicationStatus: MessageApplicationStatus.AMBIGUOUS,
        OR: [
          { providerMessageId: null },
          { providerMessageId: prepared.providerMessageId }
        ]
      },
      data: {
        applicationStatus,
        providerMessageId: prepared.providerMessageId,
        providerStatus: fetched.status.providerStatus,
        providerErrorCode: fetched.providerErrorCode,
        ...(applicationStatus === MessageApplicationStatus.SENT ||
        applicationStatus === MessageApplicationStatus.DELIVERED
          ? { sentAt }
          : {}),
        ...(applicationStatus === MessageApplicationStatus.DELIVERED
          ? { deliveredAt, failedAt: null }
          : {}),
        ...(applicationStatus === MessageApplicationStatus.FAILED
          ? { deliveredAt: null, failedAt }
          : {})
      }
    });
    if (messageUpdate.count !== 1) throw reviewError("DELIVERY_ATTEMPT_CONFLICT");

    await enqueueReconciliationEvents(tx, {
      orgId: input.orgId,
      messageId: prepared.messageId,
      attemptId: input.attemptId,
      contactId: attempt.message.contactId,
      conversationId: attempt.message.conversationId,
      applicationStatus,
      attemptStatus,
      providerStatus: fetched.status.providerStatus,
      providerErrorCode: fetched.providerErrorCode,
      sentAt,
      deliveredAt,
      failedAt
    });
    await auditAttemptAction(tx, {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: "MESSAGE_ATTEMPT_RECONCILED",
      attemptId: input.attemptId,
      metadata: {
        messageId: prepared.messageId,
        outcome: applicationStatus,
        attemptStatus,
        providerStatus: fetched.status.providerStatus,
        providerErrorCode: fetched.providerErrorCode
      }
    });
  });
  return getDeliveryAttempt(input.orgId, input.attemptId, { transaction });
}

export async function attestDeliveryAttemptNotSent(
  input: Readonly<{
    orgId: string;
    attemptId: string;
    actorUserId: string;
    reason: string;
  }>,
  dependencies: Pick<ReviewDependencies, "transaction" | "now"> = {}
): Promise<DeliveryAttemptReviewDto> {
  assertReviewActor(input);
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw reviewError("DELIVERY_ATTEMPT_INVALID");
  const transaction = dependencies.transaction ?? withTenantTransaction;
  const now = serviceNow(dependencies);
  await transaction({ orgId: input.orgId, userId: input.actorUserId }, async (tx) => {
    await lockAttemptAndMessage(tx, input.orgId, input.attemptId);
    const attempt = await tx.messageAttempt.findFirst({
      where: { orgId: input.orgId, id: input.attemptId },
      include: { message: true, retries: { select: { id: true }, take: 1 } }
    });
    if (!attempt) throw reviewError("DELIVERY_ATTEMPT_NOT_FOUND");
    if (
      attempt.status !== MessageAttemptStatus.AMBIGUOUS ||
      attempt.providerMessageId !== null ||
      attempt.message.providerMessageId !== null ||
      attempt.providerStatus !== null ||
      attempt.message.providerStatus !== null ||
      attempt.reconciledAt !== null ||
      attempt.retries.length > 0
    ) {
      throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
    }
    const updated = await tx.messageAttempt.updateMany({
      where: {
        orgId: input.orgId,
        id: input.attemptId,
        status: MessageAttemptStatus.AMBIGUOUS,
        providerMessageId: null,
        reconciledAt: null
      },
      data: {
        status: MessageAttemptStatus.RESOLVED_NOT_SENT,
        disposition: "not_sent",
        reconciledAt: now,
        reconciledByUserId: input.actorUserId,
        reconciliationNote: reason
      }
    });
    if (updated.count !== 1) throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
    await auditAttemptAction(tx, {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: "MESSAGE_ATTEMPT_ATTESTED_NOT_SENT",
      attemptId: input.attemptId,
      metadata: {
        messageId: attempt.messageId,
        outcome: MessageAttemptStatus.RESOLVED_NOT_SENT,
        reasonRecorded: true
      }
    });
  });
  return getDeliveryAttempt(input.orgId, input.attemptId, { transaction });
}

export async function retryAttestedDeliveryAttempt(
  input: Readonly<{ orgId: string; attemptId: string; actorUserId: string }>,
  dependencies: Pick<ReviewDependencies, "transaction" | "now" | "randomId"> = {}
): Promise<DeliveryAttemptReviewDto> {
  assertReviewActor(input);
  const transaction = dependencies.transaction ?? withTenantTransaction;
  const now = serviceNow(dependencies);
  const successorId = serviceId(dependencies);
  const callbackCorrelationId = serviceId(dependencies);
  const createdAttemptId = await transaction(
    { orgId: input.orgId, userId: input.actorUserId },
    async (tx) => {
      await lockAttemptAndMessage(tx, input.orgId, input.attemptId);
      const attempt = await tx.messageAttempt.findFirst({
        where: { orgId: input.orgId, id: input.attemptId },
        include: { message: true, retries: { select: { id: true }, take: 1 } }
      });
      if (!attempt) throw reviewError("DELIVERY_ATTEMPT_NOT_FOUND");
      if (
        attempt.status !== MessageAttemptStatus.RESOLVED_NOT_SENT ||
        attempt.reconciledAt === null ||
        attempt.providerMessageId !== null ||
        attempt.message.providerMessageId !== null ||
        attempt.message.applicationStatus !== MessageApplicationStatus.AMBIGUOUS ||
        attempt.attemptNumber >= DIRECT_MESSAGE_MAX_ATTEMPTS ||
        attempt.retries.length > 0
      ) {
        throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
      }
      const laterAttempt = await tx.messageAttempt.findFirst({
        where: {
          orgId: input.orgId,
          messageId: attempt.messageId,
          attemptNumber: { gt: attempt.attemptNumber }
        },
        select: { id: true }
      });
      if (laterAttempt) throw reviewError("DELIVERY_ATTEMPT_CONFLICT");

      const successor = await tx.messageAttempt.create({
        data: {
          id: successorId,
          orgId: input.orgId,
          messageId: attempt.messageId,
          attemptNumber: attempt.attemptNumber + 1,
          retryOfAttemptId: attempt.id,
          status: MessageAttemptStatus.QUEUED,
          transport: attempt.transport,
          dueAt: now,
          providerAccountId: attempt.providerAccountId,
          providerPhoneNumberId: attempt.providerPhoneNumberId,
          destination: attempt.destination,
          body: attempt.body,
          mediaUrls: attempt.mediaUrls,
          requestFingerprint: attempt.requestFingerprint,
          callbackCorrelationId,
          createdAt: now,
          updatedAt: now
        }
      });
      const messageUpdate = await tx.message.updateMany({
        where: {
          orgId: input.orgId,
          id: attempt.messageId,
          applicationStatus: MessageApplicationStatus.AMBIGUOUS,
          providerMessageId: null
        },
        data: {
          applicationStatus: MessageApplicationStatus.SCHEDULED,
          scheduledAt: now,
          attemptCount: successor.attemptNumber,
          providerStatus: null,
          providerErrorCode: null
        }
      });
      if (messageUpdate.count !== 1) throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
      await enqueueCustomerWebhookEvent(tx, {
        orgId: input.orgId,
        deduplicationKey: messageAttemptEventDeduplicationKey(
          "message.status.updated",
          attempt.messageId,
          successor.id,
          "scheduled"
        ),
        type: "message.status.updated",
        aggregateType: "message",
        aggregateId: attempt.messageId,
        data: {
          messageId: attempt.messageId,
          contactId: attempt.message.contactId,
          conversationId: attempt.message.conversationId,
          applicationStatus: MessageApplicationStatus.SCHEDULED,
          attemptStatus: MessageAttemptStatus.QUEUED,
          attemptNumber: successor.attemptNumber,
          providerStatus: null,
          providerErrorCode: null,
          transport: attempt.transport.toLowerCase(),
          requiresReview: false,
          scheduledAt: now.toISOString()
        }
      });
      await auditAttemptAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        action: "MESSAGE_ATTEMPT_RETRY_CREATED",
        attemptId: input.attemptId,
        metadata: {
          messageId: attempt.messageId,
          successorAttemptId: successor.id,
          successorAttemptNumber: successor.attemptNumber
        }
      });
      return successor.id;
    }
  );
  return getDeliveryAttempt(input.orgId, createdAttemptId, { transaction });
}

async function prepareReconciliation(
  input: Readonly<{ orgId: string; attemptId: string; actorUserId: string }>,
  transaction: typeof withTenantTransaction,
  now: Date
): Promise<PreparedReconciliation> {
  return transaction({ orgId: input.orgId, userId: input.actorUserId }, async (tx) => {
    const attempt = await tx.messageAttempt.findFirst({
      where: { orgId: input.orgId, id: input.attemptId },
      include: { message: true, providerAccount: true, providerPhoneNumber: true }
    });
    if (!attempt) throw reviewError("DELIVERY_ATTEMPT_NOT_FOUND");
    if (
      attempt.status !== MessageAttemptStatus.AMBIGUOUS ||
      attempt.transport !== MessageTransport.TWILIO ||
      !attempt.providerMessageId ||
      !attempt.providerAccountId ||
      !attempt.providerPhoneNumberId ||
      !attempt.providerAccount ||
      !attempt.providerPhoneNumber ||
      attempt.providerAccount.provider !== "twilio" ||
      attempt.providerAccount.status !== ProviderAccountStatus.VERIFIED ||
      attempt.providerAccount.revokedAt !== null ||
      attempt.providerPhoneNumber.status !== ProviderPhoneNumberStatus.VERIFIED ||
      attempt.providerPhoneNumber.disabledAt !== null ||
      attempt.providerPhoneNumber.providerAccountId !== attempt.providerAccountId
    ) {
      throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
    }
    const secret = await tx.providerCredentialSecret.findFirst({
      where: {
        orgId: input.orgId,
        providerAccountId: attempt.providerAccountId,
        activeFrom: { lte: now },
        retiredAt: null
      },
      orderBy: { version: "desc" }
    });
    if (!secret) throw reviewError("DELIVERY_ATTEMPT_PROVIDER_UNAVAILABLE");
    const snapshot: ProviderSendCredentialSnapshot = Object.freeze({
      orgId: input.orgId,
      provider: "twilio",
      providerAccountId: attempt.providerAccount.id,
      externalAccountId: attempt.providerAccount.externalAccountId,
      externalAccountIdHash: attempt.providerAccount.externalAccountIdHash,
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
    return Object.freeze({
      orgId: input.orgId,
      attemptId: attempt.id,
      messageId: attempt.messageId,
      providerMessageId: attempt.providerMessageId,
      destination: attempt.destination,
      sender: attempt.providerPhoneNumber.phoneNumber,
      providerAccountId: attempt.providerAccountId,
      providerPhoneNumberId: attempt.providerPhoneNumberId,
      credentialSecretId: secret.id,
      credentialVersion: secret.version,
      externalAccountId: attempt.providerAccount.externalAccountId,
      snapshot
    });
  });
}

async function recordReconciliationNoChange(
  input: Readonly<{ orgId: string; attemptId: string; actorUserId: string }>,
  prepared: PreparedReconciliation,
  transaction: typeof withTenantTransaction
): Promise<void> {
  await transaction({ orgId: input.orgId, userId: input.actorUserId }, async (tx) => {
    await lockAttemptAndMessage(tx, input.orgId, input.attemptId);
    const current = await tx.messageAttempt.findFirst({
      where: {
        orgId: input.orgId,
        id: input.attemptId,
        messageId: prepared.messageId,
        status: MessageAttemptStatus.AMBIGUOUS,
        providerMessageId: prepared.providerMessageId
      },
      select: { id: true }
    });
    if (!current) throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
    await auditAttemptAction(tx, {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: "MESSAGE_ATTEMPT_RECONCILED",
      attemptId: input.attemptId,
      metadata: {
        messageId: prepared.messageId,
        outcome: "PROVIDER_EVIDENCE_MISMATCH",
        attemptStatus: MessageAttemptStatus.AMBIGUOUS
      }
    });
  });
}

async function assertPreparedAuthorityCurrent(
  tx: Prisma.TransactionClient,
  prepared: PreparedReconciliation,
  now: Date
): Promise<void> {
  const [account, sender, secret] = await Promise.all([
    tx.providerAccount.findFirst({
      where: {
        orgId: prepared.orgId,
        id: prepared.providerAccountId,
        provider: "twilio",
        status: ProviderAccountStatus.VERIFIED,
        revokedAt: null
      },
      select: { externalAccountId: true }
    }),
    tx.providerPhoneNumber.findFirst({
      where: {
        orgId: prepared.orgId,
        id: prepared.providerPhoneNumberId,
        providerAccountId: prepared.providerAccountId,
        status: ProviderPhoneNumberStatus.VERIFIED,
        disabledAt: null,
        phoneNumber: prepared.sender
      },
      select: { id: true }
    }),
    tx.providerCredentialSecret.findFirst({
      where: {
        orgId: prepared.orgId,
        id: prepared.credentialSecretId,
        providerAccountId: prepared.providerAccountId,
        version: prepared.credentialVersion,
        activeFrom: { lte: now },
        retiredAt: null
      },
      select: { id: true }
    })
  ]);
  if (!account || account.externalAccountId !== prepared.externalAccountId || !sender || !secret) {
    throw reviewError("DELIVERY_ATTEMPT_CONFLICT");
  }
}

async function lockReconciliationRows(
  tx: Prisma.TransactionClient,
  prepared: PreparedReconciliation
): Promise<void> {
  await lockAttemptAndMessage(tx, prepared.orgId, prepared.attemptId);
  await tx.$queryRaw`
    SELECT id FROM "ProviderAccount"
    WHERE "orgId" = ${prepared.orgId} AND id = ${prepared.providerAccountId}
    FOR SHARE
  `;
  await tx.$queryRaw`
    SELECT id FROM "ProviderPhoneNumber"
    WHERE "orgId" = ${prepared.orgId} AND id = ${prepared.providerPhoneNumberId}
    FOR SHARE
  `;
  await tx.$queryRaw`
    SELECT id FROM "ProviderCredentialSecret"
    WHERE "orgId" = ${prepared.orgId} AND id = ${prepared.credentialSecretId}
    FOR SHARE
  `;
}

async function lockAttemptAndMessage(
  tx: Prisma.TransactionClient,
  orgId: string,
  attemptId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT attempt.id
    FROM "MessageAttempt" attempt
    JOIN "Message" message
      ON message."orgId" = attempt."orgId"
     AND message.id = attempt."messageId"
    WHERE attempt."orgId" = ${orgId} AND attempt.id = ${attemptId}
    FOR UPDATE OF attempt, message
  `;
}

async function enqueueReconciliationEvents(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    messageId: string;
    attemptId: string;
    contactId: string | null;
    conversationId: string | null;
    applicationStatus: MessageApplicationStatus;
    attemptStatus: MessageAttemptStatus;
    providerStatus: string;
    providerErrorCode: string | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    failedAt: Date | null;
  }>
): Promise<void> {
  const data = {
    messageId: input.messageId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    applicationStatus: input.applicationStatus,
    attemptStatus: input.attemptStatus,
    providerStatus: input.providerStatus,
    providerErrorCode: input.providerErrorCode,
    sentAt: input.sentAt?.toISOString() ?? null,
    deliveredAt: input.deliveredAt?.toISOString() ?? null,
    failedAt: input.failedAt?.toISOString() ?? null,
    transport: "twilio",
    mode: "provider",
    requiresReview: false
  } satisfies Prisma.InputJsonObject;
  await enqueueCustomerWebhookEvent(tx, {
    orgId: input.orgId,
    deduplicationKey: messageAttemptEventDeduplicationKey(
      "message.status.updated",
      input.messageId,
      input.attemptId,
      input.providerStatus,
      input.providerErrorCode
    ),
    type: "message.status.updated",
    aggregateType: "message",
    aggregateId: input.messageId,
    data
  });
  const lifecycleType =
    input.applicationStatus === MessageApplicationStatus.DELIVERED
      ? "message.delivered"
      : input.applicationStatus === MessageApplicationStatus.FAILED
        ? "message.failed"
        : "message.sent";
  await enqueueCustomerWebhookEvent(tx, {
    orgId: input.orgId,
    deduplicationKey: messageAttemptEventDeduplicationKey(
      lifecycleType,
      input.messageId,
      input.attemptId
    ),
    type: lifecycleType,
    aggregateType: "message",
    aggregateId: input.messageId,
    data
  });
}

async function auditAttemptAction(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    actorUserId: string;
    action: string;
    attemptId: string;
    metadata: Prisma.InputJsonObject;
  }>
): Promise<void> {
  await tx.integrationAuditEvent.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: input.action,
      subjectType: "message_attempt",
      subjectId: input.attemptId,
      metadata: input.metadata
    }
  });
}

function projectReviewAttempt(attempt: ReviewAttempt): DeliveryAttemptReviewDto {
  const requiresReview = attempt.status === MessageAttemptStatus.AMBIGUOUS;
  const hasProviderMessageId = attempt.providerMessageId !== null;
  return Object.freeze({
    id: attempt.id,
    messageId: attempt.messageId,
    attemptNumber: attempt.attemptNumber,
    applicationStatus: attempt.message.applicationStatus,
    attemptStatus: attempt.status,
    transport: attempt.transport.toLowerCase() as "dummy" | "twilio",
    providerStatus: safeProviderStatus(attempt.providerStatus),
    providerErrorCode: safeProviderErrorCode(attempt.providerErrorCode),
    hasProviderMessageId,
    destinationLastFour: lastFour(attempt.destination),
    senderLastFour: attempt.providerPhoneNumber
      ? lastFour(attempt.providerPhoneNumber.phoneNumber)
      : null,
    requiresReview,
    canReconcile: requiresReview && hasProviderMessageId,
    canAttestNotSent:
      requiresReview &&
      !hasProviderMessageId &&
      attempt.message.providerMessageId === null &&
      attempt.providerStatus === null,
    canRetry:
      attempt.status === MessageAttemptStatus.RESOLVED_NOT_SENT &&
      attempt.message.applicationStatus === MessageApplicationStatus.AMBIGUOUS &&
      !hasProviderMessageId &&
      attempt.message.providerMessageId === null &&
      attempt.attemptNumber < DIRECT_MESSAGE_MAX_ATTEMPTS &&
      attempt.retries.length === 0,
    timestamps: Object.freeze({
      acceptedAt: attempt.message.acceptedAt.toISOString(),
      dueAt: attempt.dueAt.toISOString(),
      claimedAt: iso(attempt.claimedAt),
      providerCallStartedAt: iso(attempt.providerCallStartedAt),
      scheduledAt: iso(attempt.message.scheduledAt),
      sentAt: iso(attempt.message.sentAt),
      deliveredAt: iso(attempt.message.deliveredAt),
      failedAt: iso(attempt.message.failedAt),
      cancelledAt: iso(attempt.message.cancelledAt),
      ambiguousAt: iso(attempt.message.ambiguousAt),
      completedAt: iso(attempt.completedAt),
      reconciledAt: iso(attempt.reconciledAt),
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString()
    })
  });
}

function applicationStatusFromFetched(record: ProviderMessageRecord): MessageApplicationStatus {
  if (isTerminalDeliveryFailureProviderStatus(record.status.status)) {
    return MessageApplicationStatus.FAILED;
  }
  return record.status.status === "delivered" ||
    record.status.status === "received" ||
    record.status.status === "read"
    ? MessageApplicationStatus.DELIVERED
    : MessageApplicationStatus.SENT;
}

function fetchedEvidenceMatches(
  prepared: PreparedReconciliation,
  record: ProviderMessageRecord
): boolean {
  return (
    record.externalAccountId === prepared.externalAccountId &&
    record.providerMessageId === prepared.providerMessageId &&
    record.to === prepared.destination &&
    record.from === prepared.sender &&
    record.messagingServiceId === null
  );
}

function safeProviderStatus(value: string | null): string | null {
  return value && /^[a-z0-9][a-z0-9_.:-]{0,127}$/.test(value) ? value : null;
}

function safeProviderErrorCode(value: string | null): string | null {
  return value && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value) ? value : null;
}

function lastFour(value: string): string {
  const suffix = value.slice(-4);
  return /^\d{4}$/.test(suffix) ? suffix : "----";
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function assertReviewActor(input: Readonly<{ orgId: string; attemptId: string; actorUserId: string }>) {
  assertIdentifier(input.orgId);
  assertIdentifier(input.attemptId);
  assertIdentifier(input.actorUserId);
}

function assertIdentifier(value: string): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 191 ||
    value.trim() !== value ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)
  ) {
    throw reviewError("DELIVERY_ATTEMPT_INVALID");
  }
}

function serviceNow(dependencies: Pick<ReviewDependencies, "now">): Date {
  const now = dependencies.now?.() ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw reviewError("DELIVERY_ATTEMPT_INVALID");
  }
  return new Date(now.getTime());
}

function serviceId(dependencies: Pick<ReviewDependencies, "randomId">): string {
  const value = dependencies.randomId?.() ?? randomUUID();
  assertIdentifier(value);
  return value;
}

function reviewError(code: DeliveryAttemptReviewErrorCode): DeliveryAttemptReviewError {
  return new DeliveryAttemptReviewError(code);
}
