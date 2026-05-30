import { ConsentStatus, ConversationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { listConversations, listConversationMessages } from "@/lib/db/repositories/inbox";
import { productInboxWorkspaceDefaults } from "@/lib/product/inbox-workspace-defaults";
import { getProductInbox, productInboxMetricRows, productInboxThreadStatusRows } from "@/lib/product/inbox";

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
    expect(result.metrics).toEqual([
      { key: "total", label: "Total Threads", value: 2 },
      { key: "open", label: "Open Threads", value: 1 },
      { key: "resolved", label: "Resolved Threads", value: 1 },
      { key: "inboundMessages", label: "Recent Inbound", value: 1 }
    ]);
    expect(result.conversations[0]).toMatchObject({
      id: "conversation_1",
      selected: true,
      status: ConversationStatus.OPEN,
      contactName: "Ada Lovelace",
      phone: "+15555550100",
      consentStatus: ConsentStatus.OPTED_IN,
      assignedTo: "Demo Owner",
      latestMessage: "Can you send pricing?"
    });
    expect(result.conversations[1]).toMatchObject({
      selected: false,
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
    expect(result.selectedConversation?.statusRows).toEqual([
      { key: "thread", label: "Thread", value: ConversationStatus.OPEN },
      { key: "consent", label: "Consent", value: ConsentStatus.OPTED_IN },
      { key: "lead", label: "Lead score", value: "Not qualified" },
      { key: "sentiment", label: "Sentiment", value: "Not analyzed" },
      { key: "category", label: "Category", value: "Not categorized" }
    ]);
  });

  it("selects a requested conversation from the local inbox query when present", async () => {
    vi.mocked(listConversationMessages).mockClear();

    const result = await getProductInbox("org_1", "conversation_2");

    expect(result.conversations.map((conversation) => [conversation.id, conversation.selected])).toEqual([
      ["conversation_1", false],
      ["conversation_2", true]
    ]);
    expect(result.selectedConversation?.id).toBe("conversation_2");
    expect(result.selectedConversation?.contactName).toBe("Unknown contact");
    expect(vi.mocked(listConversationMessages)).toHaveBeenCalledWith("org_1", "conversation_2");
  });

  it("falls back to the first conversation when a requested thread is not in the tenant inbox", async () => {
    vi.mocked(listConversationMessages).mockClear();

    const result = await getProductInbox("org_1", "missing_conversation");

    expect(result.conversations.map((conversation) => [conversation.id, conversation.selected])).toEqual([
      ["conversation_1", true],
      ["conversation_2", false]
    ]);
    expect(result.selectedConversation?.id).toBe("conversation_1");
    expect(vi.mocked(listConversationMessages)).toHaveBeenCalledWith("org_1", "conversation_1");
  });

  it("exposes the selected contact's formatted lead status when present", async () => {
    vi.mocked(listConversations).mockImplementationOnce(async () => [
      {
        id: "conversation_3",
        status: ConversationStatus.OPEN,
        contact: {
          displayName: "Bob",
          firstName: "Bob",
          lastName: "Smith",
          phone: "+15555550200",
          consentStatus: ConsentStatus.OPTED_IN,
          leadScore: 82,
          leadStage: "HOT"
        },
        assignedTo: null,
        assignedToUserId: null,
        lastMessageAt: new Date("2026-01-03T10:00:00.000Z"),
        updatedAt: new Date("2026-01-03T10:00:00.000Z"),
        messages: [],
        internalNotes: []
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const result = await getProductInbox("org_1", "conversation_3");
    expect(result.selectedConversation?.statusRows).toContainEqual({
      key: "lead",
      label: "Lead score",
      value: "82 · HOT"
    });
  });

  it("freezes inbox metric metadata before rendering", () => {
    expect(Object.isFrozen(productInboxMetricRows)).toBe(true);
    expect(productInboxMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productInboxMetricRows.map((row) => row.key)).toEqual([
      "total",
      "open",
      "resolved",
      "inboundMessages"
    ]);

    expect(() =>
      (productInboxMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productInboxMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productInboxMetricRows[0].label).toBe("Total Threads");
  });

  it("freezes inbox thread status metadata before rendering", () => {
    expect(Object.isFrozen(productInboxThreadStatusRows)).toBe(true);
    expect(productInboxThreadStatusRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productInboxThreadStatusRows.map((row) => row.key)).toEqual(["thread", "consent", "lead", "sentiment", "category"]);
    expect(productInboxThreadStatusRows.map((row) => row.label)).toEqual(["Thread", "Consent", "Lead score", "Sentiment", "Category"]);

    expect(() =>
      (productInboxThreadStatusRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productInboxThreadStatusRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productInboxThreadStatusRows[0].label).toBe("Thread");
  });

  it("freezes inbox workspace defaults before rendering local reply and note forms", () => {
    expect(Object.isFrozen(productInboxWorkspaceDefaults)).toBe(true);
    expect(productInboxWorkspaceDefaults).toEqual({
      inboundReply: "YES, please send the starter plan details.",
      internalNote: "Follow up with pricing context after demo."
    });

    expect(() => {
      (productInboxWorkspaceDefaults as { inboundReply: string }).inboundReply = "Unsafe";
    }).toThrow(TypeError);
    expect(() => {
      (productInboxWorkspaceDefaults as { internalNote: string }).internalNote = "Unsafe";
    }).toThrow(TypeError);
    expect(productInboxWorkspaceDefaults.inboundReply).toBe("YES, please send the starter plan details.");
  });
});
