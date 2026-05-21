import { ConsentStatus, ConversationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getProductInbox } from "@/lib/product/inbox";

vi.mock("@/lib/db/repositories/inbox", () => ({
  listConversations: vi.fn(async () => [
    {
      id: "conversation_1",
      status: ConversationStatus.OPEN,
      contact: {
        displayName: "Ada Lovelace",
        firstName: "Ada",
        lastName: "Lovelace",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN
      },
      assignedTo: { displayName: "Demo Owner", email: "owner@example.com" },
      assignedToUserId: "user_1",
      lastMessageAt: new Date("2026-01-03T10:00:00.000Z"),
      updatedAt: new Date("2026-01-03T10:00:00.000Z"),
      messages: [
        {
          id: "message_latest",
          direction: "INBOUND",
          body: "Can you send pricing?"
        }
      ],
      internalNotes: [
        {
          id: "note_1",
          body: "Interested in pricing.",
          author: { displayName: "Demo Owner", email: "owner@example.com" },
          createdAt: new Date("2026-01-03T10:05:00.000Z")
        }
      ]
    },
    {
      id: "conversation_2",
      status: ConversationStatus.RESOLVED,
      contact: null,
      assignedTo: null,
      assignedToUserId: null,
      lastMessageAt: null,
      updatedAt: new Date("2026-01-02T10:00:00.000Z"),
      messages: [],
      internalNotes: []
    }
  ]),
  listConversationMessages: vi.fn(async () => [
    {
      id: "message_1",
      direction: "INBOUND",
      body: "Can you send pricing?",
      providerStatus: null,
      createdAt: new Date("2026-01-03T10:00:00.000Z")
    }
  ])
}));

describe("getProductInbox", () => {
  it("builds inbox summaries, rows, and the selected thread from repository data", async () => {
    const result = await getProductInbox("org_1");

    expect(result.summary).toEqual({
      total: 2,
      open: 1,
      resolved: 1,
      inboundMessages: 1
    });
    expect(result.conversations[0]).toMatchObject({
      id: "conversation_1",
      status: ConversationStatus.OPEN,
      contactName: "Ada Lovelace",
      phone: "+15555550100",
      consentStatus: ConsentStatus.OPTED_IN,
      assignedTo: "Demo Owner",
      latestMessage: "Can you send pricing?"
    });
    expect(result.conversations[1]).toMatchObject({
      contactName: "Unknown contact",
      phone: "Unknown phone",
      assignedTo: "Unassigned",
      latestMessage: "No messages yet"
    });
    expect(result.selectedConversation?.messages).toEqual([
      {
        id: "message_1",
        direction: "INBOUND",
        body: "Can you send pricing?",
        providerStatus: null,
        createdAt: "2026-01-03T10:00:00.000Z"
      }
    ]);
    expect(result.selectedConversation?.notes[0]).toMatchObject({
      body: "Interested in pricing.",
      authorName: "Demo Owner"
    });
  });
});
