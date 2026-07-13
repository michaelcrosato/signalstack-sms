import type { Prisma } from "@prisma/client";

export const publicMessageSelect = {
  id: true,
  contactId: true,
  conversationId: true,
  campaignId: true,
  direction: true,
  body: true,
  applicationStatus: true,
  transport: true,
  mediaUrls: true,
  attemptCount: true,
  providerMessageId: true,
  providerStatus: true,
  providerErrorCode: true,
  deliveredAt: true,
  failedAt: true,
  createdAt: true,
  updatedAt: true,
  attempts: {
    orderBy: [{ attemptNumber: "desc" as const }, { id: "desc" as const }],
    take: 1,
    select: {
      status: true,
      attemptNumber: true,
      errorCode: true,
      disposition: true,
      completedAt: true
    }
  },
  contact: { select: { phone: true, displayName: true } },
  conversation: { select: { status: true } }
} satisfies Prisma.MessageSelect;

type PublicMessageRow = Prisma.MessageGetPayload<{ select: typeof publicMessageSelect }>;

export function serializePublicMessage(row: PublicMessageRow) {
  const lifecycle = publicMessageLifecycle(row);
  return {
    id: row.id,
    contactId: row.contactId,
    conversationId: row.conversationId,
    campaignId: row.campaignId,
    direction: row.direction,
    body: row.body,
    status: lifecycle.status,
    applicationStatus: lifecycle.applicationStatus,
    transport: lifecycle.transport,
    attemptCount: lifecycle.attemptCount,
    latestAttemptStatus: lifecycle.latestAttemptStatus,
    latestAttemptNumber: lifecycle.latestAttemptNumber,
    requiresReview: lifecycle.requiresReview,
    providerStatus: row.providerStatus,
    providerErrorCode: row.providerErrorCode,
    providerMessageId: row.providerMessageId,
    mode: lifecycle.mode,
    mediaUrls: row.mediaUrls,
    contact: row.contact ? { phone: row.contact.phone, displayName: row.contact.displayName } : null,
    conversation: row.conversation ? { status: row.conversation.status } : null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicDeliveryStatus(row: PublicMessageRow) {
  const lifecycle = publicMessageLifecycle(row);
  return {
    messageId: row.id,
    status: lifecycle.status,
    applicationStatus: lifecycle.applicationStatus,
    transport: lifecycle.transport,
    attemptCount: lifecycle.attemptCount,
    latestAttemptStatus: lifecycle.latestAttemptStatus,
    latestAttemptNumber: lifecycle.latestAttemptNumber,
    requiresReview: lifecycle.requiresReview,
    providerStatus: row.providerStatus,
    providerErrorCode: row.providerErrorCode,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    mode: lifecycle.mode
  };
}

function publicMessageLifecycle(row: PublicMessageRow) {
  const applicationStatus = row.applicationStatus;
  const transport = row.transport.toLowerCase() as "dummy" | "twilio";
  const latestAttempt = row.attempts[0] ?? null;
  return {
    status: applicationStatus.toLowerCase(),
    applicationStatus,
    transport,
    attemptCount: row.attemptCount,
    latestAttemptStatus: latestAttempt?.status ?? null,
    latestAttemptNumber: latestAttempt?.attemptNumber ?? null,
    requiresReview:
      applicationStatus === "AMBIGUOUS" || latestAttempt?.status === "AMBIGUOUS",
    mode: transport === "dummy" ? "dummy" : "provider"
  } as const;
}
