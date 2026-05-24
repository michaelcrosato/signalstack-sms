import { ConversationStatus } from "@prisma/client";
import { listConversations, listConversationMessages } from "@/lib/db/repositories/inbox";

const productInboxMetricRowItems = [
  { key: "total", label: "Total Threads" },
  { key: "open", label: "Open Threads" },
  { key: "resolved", label: "Resolved Threads" },
  { key: "inboundMessages", label: "Recent Inbound" }
] as const;

export const productInboxMetricRows = Object.freeze(
  productInboxMetricRowItems.map((row) => Object.freeze({ ...row }))
);

const productInboxThreadStatusRowItems = [
  { key: "thread", label: "Thread" },
  { key: "consent", label: "Consent" }
] as const;

type ProductInboxThreadStatusKey = (typeof productInboxThreadStatusRowItems)[number]["key"];

export const productInboxThreadStatusRows = Object.freeze(
  productInboxThreadStatusRowItems.map((row) => Object.freeze({ ...row }))
);

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
  const summary = {
    total: conversations.length,
    open: conversations.filter((conversation) => conversation.status === ConversationStatus.OPEN).length,
    resolved: conversations.filter((conversation) => conversation.status === ConversationStatus.RESOLVED).length,
    inboundMessages: conversations.reduce(
      (count, conversation) =>
        count +
        conversation.messages.filter((message) => message.direction === "INBOUND").length,
      0
    )
  };

  return {
    summary,
    metrics: productInboxMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: summary[row.key]
    })),
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
          })),
          statusRows: productInboxThreadStatusRows.map((row) => ({
            key: row.key,
            label: row.label,
            value: getInboxThreadStatusValue(row.key, {
              status: selectedConversation.status,
              consentStatus: selectedConversation.contact?.consentStatus ?? "UNKNOWN"
            })
          }))
        }
      : null
  };
}

function getInboxThreadStatusValue(
  key: ProductInboxThreadStatusKey,
  conversation: {
    status: string;
    consentStatus: string;
  }
) {
  switch (key) {
    case "thread":
      return conversation.status;
    case "consent":
      return conversation.consentStatus;
  }
}
