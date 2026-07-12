import { createHash, randomUUID } from "node:crypto";
import { ConsentStatus, ConversationStatus, type Prisma } from "@prisma/client";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";

export const publicMessageSelect = {
  id: true,
  contactId: true,
  conversationId: true,
  campaignId: true,
  direction: true,
  body: true,
  providerMessageId: true,
  providerStatus: true,
  providerErrorCode: true,
  deliveredAt: true,
  failedAt: true,
  createdAt: true,
  contact: { select: { phone: true, displayName: true } },
  conversation: { select: { status: true } }
} satisfies Prisma.MessageSelect;

type PublicMessageRow = Prisma.MessageGetPayload<{ select: typeof publicMessageSelect }>;

export type DummyMessageSubmission =
  | Readonly<{ ok: true; message: ReturnType<typeof serializePublicMessage> }>
  | Readonly<{ ok: false; kind: "not_found" | "blocked"; reasons?: readonly string[] }>;

/**
 * Persist an explicitly dummy/local outbound lifecycle. No provider adapter or network call occurs;
 * M5 will replace this acceptance path with the durable direct-send state machine.
 */
export async function submitDummyPublicMessage(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    contactId: string;
    conversationId?: string;
    body: string;
  }>
): Promise<DummyMessageSubmission> {
  const contact = await tx.contact.findFirst({
    where: { orgId: input.orgId, id: input.contactId }
  });
  if (!contact) {
    return Object.freeze({ ok: false, kind: "not_found" });
  }
  const reasons: string[] = [];
  if (contact.archivedAt) reasons.push("CONTACT_ARCHIVED");
  if (contact.optedOutAt || contact.consentStatus === ConsentStatus.OPTED_OUT) reasons.push("CONTACT_OPTED_OUT");
  if (contact.consentStatus !== ConsentStatus.OPTED_IN) reasons.push("CONTACT_NOT_OPTED_IN");
  if (reasons.length > 0) {
    return Object.freeze({ ok: false, kind: "blocked", reasons: Object.freeze(reasons) });
  }

  let conversation = input.conversationId
    ? await tx.conversation.findFirst({
        where: { orgId: input.orgId, id: input.conversationId, contactId: contact.id }
      })
    : await tx.conversation.findFirst({
        where: { orgId: input.orgId, contactId: contact.id, status: ConversationStatus.OPEN },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      });
  if (input.conversationId && !conversation) {
    return Object.freeze({ ok: false, kind: "not_found" });
  }
  const createdConversation = !conversation;
  conversation ??= await tx.conversation.create({
    data: { orgId: input.orgId, contactId: contact.id, status: ConversationStatus.OPEN }
  });

  const message = await tx.message.create({
    data: {
      orgId: input.orgId,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      body: input.body,
      providerMessageId: `dummy-api-${randomUUID()}`,
      providerStatus: "accepted_dummy",
      idempotencyKey: `public-api-dummy:${randomUUID()}`
    },
    select: publicMessageSelect
  });
  await tx.conversation.update({
    where: { id: conversation.id },
    data: {
      status: ConversationStatus.OPEN,
      lastMessageAt: message.createdAt,
      resolvedAt: null
    }
  });

  if (createdConversation) {
    await enqueueCustomerWebhookEvent(tx, {
      orgId: input.orgId,
      deduplicationKey: `conversation.created:${conversation.id}`,
      type: "conversation.created",
      aggregateType: "conversation",
      aggregateId: conversation.id,
      data: { conversationId: conversation.id, contactId: contact.id, status: "OPEN" }
    });
  }
  await enqueueCustomerWebhookEvent(tx, {
    orgId: input.orgId,
    deduplicationKey: `message.accepted:${message.id}`,
    type: "message.accepted",
    aggregateType: "message",
    aggregateId: message.id,
    data: {
      messageId: message.id,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      status: "accepted_dummy",
      mode: "dummy"
    }
  });
  await enqueueCustomerWebhookEvent(tx, {
    orgId: input.orgId,
    deduplicationKey: `message.status.updated:${message.id}:accepted_dummy`,
    type: "message.status.updated",
    aggregateType: "message",
    aggregateId: message.id,
    data: {
      messageId: message.id,
      contactId: contact.id,
      conversationId: conversation.id,
      status: "accepted_dummy",
      mode: "dummy"
    }
  });
  if (!createdConversation) {
    await enqueueCustomerWebhookEvent(tx, {
      orgId: input.orgId,
      deduplicationKey: conversationUpdatedDeduplicationKey(conversation.id, message.id),
      type: "conversation.updated",
      aggregateType: "conversation",
      aggregateId: conversation.id,
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        messageId: message.id,
        status: "OPEN"
      }
    });
  }

  return Object.freeze({ ok: true, message: serializePublicMessage(message) });
}

function conversationUpdatedDeduplicationKey(conversationId: string, messageId: string): string {
  const digest = createHash("sha256")
    .update(
      `signalstack/public-conversation-event/v1\0conversation.updated\0${conversationId}\0${messageId}`,
      "utf8"
    )
    .digest("base64url");
  return `api:conversation.updated:${digest}`;
}

export function serializePublicMessage(row: PublicMessageRow) {
  return {
    id: row.id,
    contactId: row.contactId,
    conversationId: row.conversationId,
    campaignId: row.campaignId,
    direction: row.direction,
    body: row.body,
    status: publicDeliveryState(row),
    providerStatus: row.providerStatus,
    providerErrorCode: row.providerErrorCode,
    providerMessageId: row.providerMessageId,
    mode: row.providerStatus === "accepted_dummy" ? "dummy" : "provider",
    contact: row.contact ? { phone: row.contact.phone, displayName: row.contact.displayName } : null,
    conversation: row.conversation ? { status: row.conversation.status } : null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export function serializePublicDeliveryStatus(row: PublicMessageRow) {
  return {
    messageId: row.id,
    status: publicDeliveryState(row),
    providerStatus: row.providerStatus,
    providerErrorCode: row.providerErrorCode,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    mode: row.providerStatus === "accepted_dummy" ? "dummy" : "provider"
  };
}

function publicDeliveryState(row: Pick<PublicMessageRow, "deliveredAt" | "failedAt" | "providerStatus">) {
  if (row.deliveredAt) return "delivered";
  if (row.failedAt || row.providerStatus === "failed") return "failed";
  return row.providerStatus ?? "accepted";
}
