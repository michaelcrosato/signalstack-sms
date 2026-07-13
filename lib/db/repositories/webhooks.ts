import { randomUUID } from "node:crypto";
import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  type Prisma,
  type WebhookEvent
} from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { isTerminalDeliveryFailureProviderStatus } from "@/lib/messaging/delivery-status";
import { messageAttemptEventDeduplicationKey } from "@/lib/messaging/message-attempt-events";
import { twilioStatusTransition, twilioStatusUpdateGuard } from "@/lib/messaging/twilio-webhooks";

export const WEBHOOK_EVENT_CLAIM_LEASE_MS = 5 * 60 * 1000;

function retryAfterSeconds(event: WebhookEvent, now: Date) {
  if (!(event.claimExpiresAt instanceof Date)) {
    return Math.ceil(WEBHOOK_EVENT_CLAIM_LEASE_MS / 1000);
  }

  return Math.max(1, Math.ceil((event.claimExpiresAt.getTime() - now.getTime()) / 1000));
}

async function claimExistingWebhookEvent(
  event: WebhookEvent,
  input: { orgId: string },
  claim: { token: string; expiresAt: Date; now: Date }
) {
  if (event.processedAt !== null) {
    return {
      event,
      outcome: "processed",
      duplicate: true,
      claimed: false,
      claimToken: null,
      claimExpiresAt: null,
      retryAfterSeconds: null
    } as const;
  }

  const claimed = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.updateMany({
      where: {
        id: event.id,
        orgId: input.orgId,
        processedAt: null,
        OR: [
          { claimToken: null },
          { claimExpiresAt: null },
          { claimExpiresAt: { lte: claim.now } }
        ]
      },
      data: {
        claimToken: claim.token,
        claimExpiresAt: claim.expiresAt
      }
    })
  );

  if (claimed.count !== 1) {
    return {
      event,
      outcome: "in_progress",
      duplicate: true,
      claimed: false,
      claimToken: null,
      claimExpiresAt: event.claimExpiresAt,
      retryAfterSeconds: retryAfterSeconds(event, claim.now)
    } as const;
  }

  return {
    event: {
      ...event,
      claimToken: claim.token,
      claimExpiresAt: claim.expiresAt
    },
    outcome: "claimed",
    duplicate: false,
    claimed: true,
    claimToken: claim.token,
    claimExpiresAt: claim.expiresAt,
    retryAfterSeconds: null
  } as const;
}

export async function recordWebhookEvent(
  input: {
    orgId: string;
    provider: string;
    eventType: string;
    idempotencyKey: string;
    rawPayload: Record<string, string>;
  },
  options: { claimToken?: string; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  const claimToken = options.claimToken ?? randomUUID();
  const claimExpiresAt = new Date(now.getTime() + WEBHOOK_EVENT_CLAIM_LEASE_MS);
  const claim = { token: claimToken, expiresAt: claimExpiresAt, now };
  const where = { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey: input.idempotencyKey } };
  const existing = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.findUnique({ where })
  );
  if (existing) {
    return claimExistingWebhookEvent(existing, input, claim);
  }

  const insert = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.createMany({
      data: [{
        orgId: input.orgId,
        provider: input.provider,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        rawPayload: input.rawPayload as Prisma.InputJsonObject,
        processedAt: null,
        claimToken,
        claimExpiresAt
      }],
      skipDuplicates: true
    })
  );
  const event = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.findUnique({ where })
  );
  if (!event) {
    throw new Error("Webhook event insert did not produce a readable tenant row.");
  }
  if (insert.count === 1) {
    return {
      event,
      outcome: "claimed",
      duplicate: false,
      claimed: true,
      claimToken,
      claimExpiresAt,
      retryAfterSeconds: null
    } as const;
  }
  return claimExistingWebhookEvent(event, input, claim);
}

export async function markWebhookEventProcessed(
  orgId: string,
  eventId: string,
  claimToken: string,
  processedAt = new Date()
) {
  return withTenantTransaction({ orgId }, (tx) => tx.webhookEvent.updateMany({
    where: {
      id: eventId,
      orgId,
      processedAt: null,
      claimToken
    },
    data: {
      processedAt,
      claimToken: null,
      claimExpiresAt: null
    }
  }));
}

export async function releaseWebhookEventClaim(orgId: string, eventId: string, claimToken: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.webhookEvent.updateMany({
    where: {
      id: eventId,
      orgId,
      processedAt: null,
      claimToken
    },
    data: {
      claimToken: null,
      claimExpiresAt: null
    }
  }));
}

export async function updateMessageFromTwilioStatus(input: {
  orgId: string;
  providerMessageId: string;
  status: string;
  errorCode?: string;
  now?: Date;
  correlation?: Readonly<{
    attemptId: string;
    correlationId: string;
    providerAccountId: string;
    providerPhoneNumberId: string;
    destination: string;
  }>;
}) {
  return withTenantTransaction({ orgId: input.orgId }, async (tx) => {
    if (input.correlation) {
      return updateCorrelatedMessageFromTwilioStatus(tx, input);
    }

    const message = await tx.message.findFirst({
      where: {
        orgId: input.orgId,
        providerMessageId: input.providerMessageId
      },
      select: { createdAt: true }
    });

    if (!message) {
      return { matched: false, updated: false, createdAt: null };
    }

    const update = await tx.message.updateMany({
      where: {
        orgId: input.orgId,
        providerMessageId: input.providerMessageId,
        ...twilioStatusUpdateGuard(input.status)
      },
      data: twilioStatusTransition(input)
    });

    if (update.count === 0) {
      return { matched: true, updated: false, createdAt: message.createdAt };
    }

    return { matched: true, updated: true, createdAt: message.createdAt };
  });
}

async function updateCorrelatedMessageFromTwilioStatus(
  tx: Prisma.TransactionClient,
  input: {
    orgId: string;
    providerMessageId: string;
    status: string;
    errorCode?: string;
    now?: Date;
    correlation?: Readonly<{
      attemptId: string;
      correlationId: string;
      providerAccountId: string;
      providerPhoneNumberId: string;
      destination: string;
    }>;
  }
) {
  const correlation = input.correlation;
  if (!correlation) {
    throw new Error("Correlated status processing requires correlation evidence.");
  }

  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT attempt.id
    FROM "MessageAttempt" attempt
    JOIN "Message" message
      ON message."orgId" = attempt."orgId"
     AND message.id = attempt."messageId"
    WHERE attempt."orgId" = ${input.orgId}
      AND attempt.id = ${correlation.attemptId}
    FOR UPDATE OF attempt, message
  `;
  if (locked.length !== 1) {
    return { matched: false, updated: false, createdAt: null };
  }

  const attempt = await tx.messageAttempt.findFirst({
    where: {
      orgId: input.orgId,
      id: correlation.attemptId,
      callbackCorrelationId: correlation.correlationId,
      transport: MessageTransport.TWILIO,
      providerAccountId: correlation.providerAccountId,
      providerCredentialSecretId: { not: null },
      providerCredentialVersion: { not: null },
      providerPhoneNumberId: correlation.providerPhoneNumberId,
      destination: correlation.destination,
      providerCallStartedAt: { not: null },
      status: {
        in: [
          MessageAttemptStatus.PROCESSING,
          MessageAttemptStatus.SUCCEEDED,
          MessageAttemptStatus.FAILED,
          MessageAttemptStatus.AMBIGUOUS
        ]
      },
      message: {
        is: {
          orgId: input.orgId,
          direction: "OUTBOUND",
          transport: MessageTransport.TWILIO,
          destination: correlation.destination
        }
      }
    },
    select: {
      id: true,
      messageId: true,
      status: true,
      completedAt: true,
      providerMessageId: true,
      message: {
        select: {
          id: true,
          contactId: true,
          conversationId: true,
          applicationStatus: true,
          transport: true,
          providerMessageId: true,
          sentAt: true,
          deliveredAt: true,
          failedAt: true,
          createdAt: true
        }
      }
    }
  });
  if (
    !attempt ||
    attempt.messageId !== attempt.message.id ||
    (attempt.providerMessageId !== null && attempt.providerMessageId !== input.providerMessageId) ||
    (attempt.message.providerMessageId !== null &&
      attempt.message.providerMessageId !== input.providerMessageId) ||
    attempt.message.applicationStatus === MessageApplicationStatus.CANCELLED
  ) {
    return { matched: false, updated: false, createdAt: null };
  }

  const now = input.now ?? new Date();
  const providerStatus = input.status.trim().toLowerCase();
  const applicationStatus = applicationStatusForProviderCallback(providerStatus);
  const baseTransition = twilioStatusTransition({
    status: providerStatus,
    errorCode: input.errorCode,
    now
  });
  const deliveredAt =
    applicationStatus === MessageApplicationStatus.DELIVERED
      ? attempt.message.deliveredAt ?? now
      : null;
  const failedAt =
    applicationStatus === MessageApplicationStatus.FAILED
      ? attempt.message.failedAt ?? now
      : null;
  const transition = {
    ...baseTransition,
    ...(applicationStatus === MessageApplicationStatus.DELIVERED
      ? { deliveredAt, failedAt: null }
      : {}),
    ...(applicationStatus === MessageApplicationStatus.FAILED
      ? { deliveredAt: null, failedAt }
      : {})
  };
  const sentAt =
    applicationStatus === MessageApplicationStatus.SENT ||
    applicationStatus === MessageApplicationStatus.DELIVERED
      ? attempt.message.sentAt ?? now
      : attempt.message.sentAt;
  const messageUpdate = await tx.message.updateMany({
    where: {
      id: attempt.message.id,
      orgId: input.orgId,
      AND: [
        {
          OR: [
            { providerMessageId: null },
            { providerMessageId: input.providerMessageId }
          ]
        },
        twilioStatusUpdateGuard(providerStatus)
      ]
    },
    data: {
      providerMessageId: input.providerMessageId,
      ...transition,
      applicationStatus,
      ...(applicationStatus === MessageApplicationStatus.SENT ||
      applicationStatus === MessageApplicationStatus.DELIVERED
        ? { sentAt }
        : {})
    }
  });
  if (messageUpdate.count === 0) {
    return { matched: true, updated: false, createdAt: attempt.message.createdAt };
  }

  const nextAttemptStatus = attemptStatusForProviderCallback(
    attempt.status,
    providerStatus
  );
  const attemptProviderGuard = twilioStatusUpdateGuard(providerStatus).OR;
  const attemptUpdate = await tx.messageAttempt.updateMany({
    where: {
      id: attempt.id,
      orgId: input.orgId,
      callbackCorrelationId: correlation.correlationId,
      AND: [
        {
          OR: [
            { providerMessageId: null },
            { providerMessageId: input.providerMessageId }
          ]
        },
        { OR: attemptProviderGuard }
      ]
    },
    data: {
      providerMessageId: input.providerMessageId,
      providerStatus,
      providerErrorCode: transition.providerErrorCode,
      ...(nextAttemptStatus !== attempt.status
        ? {
            status: nextAttemptStatus,
            completedAt: attempt.completedAt ?? now,
            processingToken: null,
            processingExpiresAt: null,
            errorCode:
              nextAttemptStatus === MessageAttemptStatus.FAILED
                ? `TWILIO_STATUS_${providerStatus.toUpperCase()}`
                : null,
            disposition:
              nextAttemptStatus === MessageAttemptStatus.FAILED
                ? "terminal"
                : "success"
          }
        : {})
    }
  });
  if (attemptUpdate.count !== 1) {
    throw new Error("Correlated message-attempt status transition conflicted.");
  }

  const eventData = {
    messageId: attempt.message.id,
    contactId: attempt.message.contactId,
    conversationId: attempt.message.conversationId,
    applicationStatus,
    attemptStatus: nextAttemptStatus,
    providerStatus,
    providerErrorCode: transition.providerErrorCode,
    sentAt: sentAt?.toISOString() ?? null,
    deliveredAt: deliveredAt?.toISOString() ?? null,
    failedAt: failedAt?.toISOString() ?? null,
    transport: "twilio",
    mode: "provider",
    requiresReview: false
  } satisfies Prisma.InputJsonObject;
  await enqueueCustomerWebhookEvent(tx, {
    orgId: input.orgId,
    deduplicationKey: messageAttemptEventDeduplicationKey(
      "message.status.updated",
      attempt.message.id,
      attempt.id,
      providerStatus,
      transition.providerErrorCode
    ),
    type: "message.status.updated",
    aggregateType: "message",
    aggregateId: attempt.message.id,
    data: eventData
  });
  const lifecycleType = lifecycleEventType(applicationStatus);
  await enqueueCustomerWebhookEvent(tx, {
    orgId: input.orgId,
    deduplicationKey: messageAttemptEventDeduplicationKey(
      lifecycleType,
      attempt.message.id,
      attempt.id
    ),
    type: lifecycleType,
    aggregateType: "message",
    aggregateId: attempt.message.id,
    data: eventData
  });

  return { matched: true, updated: true, createdAt: attempt.message.createdAt };
}

function applicationStatusForProviderCallback(providerStatus: string): MessageApplicationStatus {
  if (isTerminalDeliveryFailureProviderStatus(providerStatus)) {
    return MessageApplicationStatus.FAILED;
  }
  if (providerStatus === "delivered" || providerStatus === "received" || providerStatus === "read") {
    return MessageApplicationStatus.DELIVERED;
  }
  return MessageApplicationStatus.SENT;
}

function attemptStatusForProviderCallback(
  current: MessageAttemptStatus,
  providerStatus: string
): MessageAttemptStatus {
  if (current !== MessageAttemptStatus.PROCESSING && current !== MessageAttemptStatus.AMBIGUOUS) {
    return current;
  }
  return isTerminalDeliveryFailureProviderStatus(providerStatus)
    ? MessageAttemptStatus.FAILED
    : MessageAttemptStatus.SUCCEEDED;
}

function lifecycleEventType(
  status: MessageApplicationStatus
): "message.sent" | "message.delivered" | "message.failed" {
  if (status === MessageApplicationStatus.DELIVERED) return "message.delivered";
  if (status === MessageApplicationStatus.FAILED) return "message.failed";
  return "message.sent";
}
