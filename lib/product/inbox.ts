import { ConversationStatus } from "@prisma/client";
import { listConversations, listConversationMessages } from "@/lib/db/repositories/inbox";

function contactName(contact: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
} | null) {
  if (!contact) {
    return "Unknown contact";
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return contact.displayName ?? (fullName || contact.phone) ?? "Unknown contact";
}

export async function getProductInbox(orgId: string) {
  const conversations = await listConversations(orgId);
  const selectedConversation = conversations[0] ?? null;
  const messages = selectedConversation ? await listConversationMessages(orgId, selectedConversation.id) : [];

  return {
    summary: {
      total: conversations.length,
      open: conversations.filter((conversation) => conversation.status === ConversationStatus.OPEN).length,
      resolved: conversations.filter((conversation) => conversation.status === ConversationStatus.RESOLVED).length,
      inboundMessages: conversations.reduce(
        (count, conversation) =>
          count +
          conversation.messages.filter((message) => message.direction === "INBOUND").length,
        0
      )
    },
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      contactName: contactName(conversation.contact),
      phone: conversation.contact?.phone ?? "Unknown phone",
      consentStatus: conversation.contact?.consentStatus ?? "UNKNOWN",
      assignedTo: conversation.assignedTo?.displayName ?? "Unassigned",
      latestMessage: conversation.messages[0]?.body ?? "No messages yet",
      lastMessageAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString()
    })),
    selectedConversation: selectedConversation
      ? {
          id: selectedConversation.id,
          status: selectedConversation.status,
          contactName: contactName(selectedConversation.contact),
          phone: selectedConversation.contact?.phone ?? "Unknown phone",
          consentStatus: selectedConversation.contact?.consentStatus ?? "UNKNOWN",
          assignedTo: selectedConversation.assignedTo?.displayName ?? "Unassigned",
          assignedToUserId: selectedConversation.assignedToUserId,
          notes: selectedConversation.internalNotes.map((note) => ({
            id: note.id,
            body: note.body,
            authorName: note.author.displayName ?? note.author.email,
            createdAt: note.createdAt.toISOString()
          })),
          messages: (messages ?? []).map((message) => ({
            id: message.id,
            direction: message.direction,
            body: message.body,
            providerStatus: message.providerStatus,
            createdAt: message.createdAt.toISOString()
          }))
        }
      : null
  };
}
