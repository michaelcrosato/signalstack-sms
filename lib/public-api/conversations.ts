import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

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
