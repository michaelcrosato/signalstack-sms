import { ConsentStatus, ConversationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitDummyPublicMessage } from "@/lib/public-api/dummy-messages";

const mocks = vi.hoisted(() => ({ enqueueCustomerWebhookEvent: vi.fn() }));

vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

const createdAt = new Date("2026-07-10T12:00:00.000Z");

describe("centralized dummy message lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({ created: true, deliveryCount: 1 });
  });

  it("emits accepted, status, and conversation-updated events for an existing conversation", async () => {
    const tx = transaction({ existingConversation: true });
    const result = await submitDummyPublicMessage(tx as never, {
      orgId: "org_1",
      contactId: "contact_1",
      conversationId: "conversation_1",
      body: "Hello"
    });

    expect(result).toMatchObject({ ok: true, message: { id: "message_1" } });
    expect(mocks.enqueueCustomerWebhookEvent.mock.calls.map((call) => call[1].type)).toEqual([
      "message.accepted",
      "message.status.updated",
      "conversation.updated"
    ]);
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenLastCalledWith(
      tx,
      expect.objectContaining({
        type: "conversation.updated",
        aggregateId: "conversation_1",
        deduplicationKey: expect.stringMatching(/^api:conversation\.updated:[A-Za-z0-9_-]{43}$/)
      })
    );
  });

  it("emits conversation-created once for a new conversation without a redundant update", async () => {
    const tx = transaction({ existingConversation: false });
    await submitDummyPublicMessage(tx as never, {
      orgId: "org_1",
      contactId: "contact_1",
      body: "Hello"
    });

    expect(mocks.enqueueCustomerWebhookEvent.mock.calls.map((call) => call[1].type)).toEqual([
      "conversation.created",
      "message.accepted",
      "message.status.updated"
    ]);
  });
});

function transaction(input: Readonly<{ existingConversation: boolean }>) {
  const conversation = {
    id: "conversation_1",
    contactId: "contact_1",
    status: ConversationStatus.OPEN
  };
  return {
    contact: {
      findFirst: vi.fn().mockResolvedValue({
        id: "contact_1",
        archivedAt: null,
        optedOutAt: null,
        consentStatus: ConsentStatus.OPTED_IN
      })
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(input.existingConversation ? conversation : null),
      create: vi.fn().mockResolvedValue(conversation),
      update: vi.fn().mockResolvedValue(conversation)
    },
    message: {
      create: vi.fn().mockResolvedValue({
        id: "message_1",
        contactId: "contact_1",
        conversationId: "conversation_1",
        campaignId: null,
        direction: "OUTBOUND",
        body: "Hello",
        providerMessageId: "dummy-api-message_1",
        providerStatus: "accepted_dummy",
        providerErrorCode: null,
        deliveredAt: null,
        failedAt: null,
        createdAt,
        contact: { phone: "+15555550100", displayName: "Demo" },
        conversation: { status: ConversationStatus.OPEN }
      })
    }
  };
}
