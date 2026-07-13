import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  type Message,
  type Prisma
} from "@prisma/client";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";

export type DirectMessageCancellationResult =
  | Readonly<{ ok: true; message: Message; alreadyCancelled: boolean }>
  | Readonly<{ ok: false; kind: "not_found" | "conflict" }>;

const cancellableMessageStatuses = new Set<MessageApplicationStatus>([
  MessageApplicationStatus.ACCEPTED,
  MessageApplicationStatus.SCHEDULED,
  MessageApplicationStatus.PROCESSING
]);
const cancellableAttemptStatuses = new Set<MessageAttemptStatus>([
  MessageAttemptStatus.QUEUED,
  MessageAttemptStatus.PROCESSING
]);

/** Conditionally cancel a direct message only while its current attempt remains before the call frontier. */
export async function cancelDirectMessage(
  tx: Prisma.TransactionClient,
  orgId: string,
  messageId: string
): Promise<DirectMessageCancellationResult> {
  const snapshot = await tx.message.findFirst({
    where: { orgId, id: messageId },
    include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } }
  });
  if (!snapshot) return Object.freeze({ ok: false, kind: "not_found" });
  if (snapshot.applicationStatus === MessageApplicationStatus.CANCELLED) {
    return Object.freeze({ ok: true, message: snapshot, alreadyCancelled: true });
  }
  const currentAttempt = snapshot.attempts[0];
  if (!currentAttempt) return Object.freeze({ ok: false, kind: "conflict" });

  // Match the dispatch function's attempt-before-message lock order.
  await tx.$queryRaw`
    SELECT id FROM "MessageAttempt"
    WHERE "orgId" = ${orgId} AND id = ${currentAttempt.id}
    FOR UPDATE
  `;
  await tx.$queryRaw`
    SELECT id FROM "Message"
    WHERE "orgId" = ${orgId} AND id = ${messageId}
    FOR UPDATE
  `;
  const [message, attempt] = await Promise.all([
    tx.message.findFirst({ where: { orgId, id: messageId } }),
    tx.messageAttempt.findFirst({
      where: { orgId, id: currentAttempt.id, messageId }
    })
  ]);
  if (!message || !attempt) return Object.freeze({ ok: false, kind: "conflict" });
  if (message.applicationStatus === MessageApplicationStatus.CANCELLED) {
    return Object.freeze({ ok: true, message, alreadyCancelled: true });
  }
  if (
    !cancellableMessageStatuses.has(message.applicationStatus) ||
    !cancellableAttemptStatuses.has(attempt.status) ||
    attempt.providerCallStartedAt !== null ||
    attempt.completedAt !== null
  ) {
    return Object.freeze({ ok: false, kind: "conflict" });
  }

  const now = await databaseNow(tx);
  await tx.messageAttempt.update({
    where: { id: attempt.id },
    data: {
      status: MessageAttemptStatus.CANCELLED,
      processingToken: null,
      processingExpiresAt: null,
      errorCode: "CANCELLED_BY_API",
      disposition: "terminal",
      completedAt: now
    }
  });
  const cancelled = await tx.message.update({
    where: { id: message.id },
    data: {
      applicationStatus: MessageApplicationStatus.CANCELLED,
      cancelledAt: now
    }
  });
  await enqueueCustomerWebhookEvent(tx, {
    orgId,
    deduplicationKey: `message.status.updated:${message.id}:cancelled:${attempt.attemptNumber}`,
    type: "message.status.updated",
    aggregateType: "message",
    aggregateId: message.id,
    data: {
      messageId: message.id,
      contactId: message.contactId,
      conversationId: message.conversationId,
      applicationStatus: "cancelled",
      attemptNumber: attempt.attemptNumber,
      providerStatus: message.providerStatus,
      providerErrorCode: message.providerErrorCode
    }
  });
  return Object.freeze({ ok: true, message: cancelled, alreadyCancelled: false });
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const now = rows[0]?.now;
  if (!now || !Number.isFinite(now.getTime())) {
    throw new Error("Direct-message cancellation database clock is unavailable.");
  }
  return now;
}
