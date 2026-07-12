import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  serializePublicMessage,
  submitDummyPublicMessage
} from "@/lib/public-api/dummy-messages";

export const publicConversationSelect = {
  id: true,
  contactId: true,
  assignedToUserId: true,
  status: true,
  lastMessageAt: true,
  resolvedAt: true,
  sentiment: true,
  category: true,
  createdAt: true,
  updatedAt: true,
  contact: {
    select: {
      id: true,
      phone: true,
      displayName: true,
      consentStatus: true,
      archivedAt: true
    }
  },
  assignedTo: { select: { id: true, displayName: true } },
  _count: { select: { messages: true } }
} satisfies Prisma.ConversationSelect;

type PublicConversationRow = Prisma.ConversationGetPayload<{
  select: typeof publicConversationSelect;
}>;

export type PublicConversationReplyResult =
  | Readonly<{ ok: true; message: ReturnType<typeof serializePublicMessage> }>
  | Readonly<{ ok: false; kind: "not_found" | "operation_not_allowed" }>;

export function serializePublicConversation(row: PublicConversationRow) {
  return {
    id: row.id,
    status: row.status,
    contact: row.contact
      ? {
          id: row.contact.id,
          phone: row.contact.phone,
          displayName: row.contact.displayName,
          consentStatus: row.contact.consentStatus,
          archivedAt: row.contact.archivedAt?.toISOString() ?? null
        }
      : null,
    assignedTo: row.assignedTo
      ? { id: row.assignedTo.id, displayName: row.assignedTo.displayName }
      : null,
    messageCount: row._count.messages,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    sentiment: row.sentiment,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function publicConversationMessagesCursorResource(conversationId: string): string {
  const binding = createHash("sha256")
    .update(`signalstack/conversation-messages-cursor/v1\0${conversationId}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `conversation-messages-${binding}`;
}

/**
 * Record a reply through the explicit local dummy-message state transition. This function does
 * not resolve or invoke a messaging provider and keeps the message plus lifecycle events in the
 * caller's idempotency transaction.
 */
export async function submitDummyPublicConversationReply(
  tx: Prisma.TransactionClient,
  input: Readonly<{ orgId: string; conversationId: string; body: string }>
): Promise<PublicConversationReplyResult> {
  const conversation = await tx.conversation.findFirst({
    where: { orgId: input.orgId, id: input.conversationId },
    select: { id: true, contactId: true }
  });
  if (!conversation) {
    return Object.freeze({ ok: false, kind: "not_found" });
  }
  if (!conversation.contactId) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  const submission = await submitDummyPublicMessage(tx, {
    orgId: input.orgId,
    contactId: conversation.contactId,
    conversationId: conversation.id,
    body: input.body
  });
  if (!submission.ok) {
    return Object.freeze({ ok: false, kind: "operation_not_allowed" });
  }

  return Object.freeze({ ok: true, message: submission.message });
}
