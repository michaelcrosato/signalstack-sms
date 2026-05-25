import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConversationInboundMessage, createDemoInboundMessage } from "@/lib/db/repositories/inbox";

const mocks = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  contactUpdate: vi.fn(),
  contactUpsert: vi.fn(),
  conversationCreate: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpsert: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

const existingConversation = {
  id: "conversation_existing",
  orgId: "org_demo",
  contactId: "contact_existing",
  status: "OPEN",
  messages: [],
  internalNotes: []
};

const existingMessage = {
  id: "message_existing",
  orgId: "org_demo",
  contactId: "contact_existing",
  conversationId: "conversation_existing",
  direction: "INBOUND",
  body: "STOP",
  providerMessageId: "SM123",
  idempotencyKey: "twilio:inbound:SM123",
  createdAt: new Date("2026-05-24T12:00:00.000Z"),
  conversation: existingConversation
};

function transactionClient() {
  return {
    contact: {
      findFirst: mocks.contactFindFirst,
      update: mocks.contactUpdate,
      upsert: mocks.contactUpsert
    },
    conversation: {
      create: mocks.conversationCreate,
      findFirst: mocks.conversationFindFirst,
      update: mocks.conversationUpdate
    },
    message: {
      findUnique: mocks.messageFindUnique,
      upsert: mocks.messageUpsert
    }
  };
}

describe("inbox message idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transactionClient()));
  });

  it("returns duplicate demo inbound messages before contact, conversation, or opt-out mutations", async () => {
    mocks.messageFindUnique.mockResolvedValue(existingMessage);

    await expect(
      createDemoInboundMessage("org_demo", {
        phone: "+15555550100",
        body: "STOP",
        idempotencyKey: "twilio:inbound:SM123"
      })
    ).resolves.toEqual({
      conversation: existingConversation,
      message: {
        id: "message_existing",
        orgId: "org_demo",
        contactId: "contact_existing",
        conversationId: "conversation_existing",
        direction: "INBOUND",
        body: "STOP",
        providerMessageId: "SM123",
        idempotencyKey: "twilio:inbound:SM123",
        createdAt: new Date("2026-05-24T12:00:00.000Z")
      },
      keywordAction: "OPT_OUT"
    });

    expect(mocks.messageFindUnique).toHaveBeenCalledWith({
      where: { orgId_idempotencyKey: { orgId: "org_demo", idempotencyKey: "twilio:inbound:SM123" } },
      include: { conversation: expect.any(Object) }
    });
    expect(mocks.contactUpsert).not.toHaveBeenCalled();
    expect(mocks.contactUpdate).not.toHaveBeenCalled();
    expect(mocks.conversationCreate).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).not.toHaveBeenCalled();
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
  });

  it("deduplicates provider-message demo inbound retries before creating local contact state", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      ...existingMessage,
      idempotencyKey: "demo-inbound:org_demo:SM123"
    });

    await createDemoInboundMessage("org_demo", {
      phone: "+15555550100",
      body: "Hi again",
      providerMessageId: "SM123"
    });

    expect(mocks.messageFindUnique).toHaveBeenCalledWith({
      where: { orgId_idempotencyKey: { orgId: "org_demo", idempotencyKey: "demo-inbound:org_demo:SM123" } },
      include: { conversation: expect.any(Object) }
    });
    expect(mocks.contactUpsert).not.toHaveBeenCalled();
    expect(mocks.conversationCreate).not.toHaveBeenCalled();
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
  });

  it("returns duplicate conversation messages before contact opt-out or conversation timestamp mutations", async () => {
    mocks.conversationFindFirst.mockResolvedValue({
      id: "conversation_demo",
      orgId: "org_demo",
      contactId: "contact_demo"
    });
    mocks.messageFindUnique.mockResolvedValue(existingMessage);

    await expect(
      createConversationInboundMessage("org_demo", "conversation_demo", {
        body: "STOP",
        idempotencyKey: "twilio:inbound:SM123"
      })
    ).resolves.toEqual({
      message: {
        id: "message_existing",
        orgId: "org_demo",
        contactId: "contact_existing",
        conversationId: "conversation_existing",
        direction: "INBOUND",
        body: "STOP",
        providerMessageId: "SM123",
        idempotencyKey: "twilio:inbound:SM123",
        createdAt: new Date("2026-05-24T12:00:00.000Z")
      },
      keywordAction: "OPT_OUT"
    });

    expect(mocks.contactFindFirst).not.toHaveBeenCalled();
    expect(mocks.contactUpdate).not.toHaveBeenCalled();
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).not.toHaveBeenCalled();
  });
});
