import {
  ConsentStatus,
  ConversationStatus,
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reserveDirectMessage,
  resolveDirectMessageTransport
} from "@/lib/messaging/direct-message-reservation";

const mocks = vi.hoisted(() => ({ enqueueCustomerWebhookEvent: vi.fn() }));

vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

const now = new Date("2026-07-12T12:00:00.000Z");
const environment = { API_KEY_PEPPER: "p".repeat(32) };

describe("durable direct-message reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({ created: true, deliveryCount: 1 });
  });

  it("atomically reserves and finalizes deterministic dummy evidence", async () => {
    const tx = transaction();
    const result = await reserveDirectMessage(
      tx.client as never,
      publicInput(MessageTransport.DUMMY),
      dependencies()
    );

    expect(result).toMatchObject({
      ok: true,
      deduped: false,
      message: { applicationStatus: MessageApplicationStatus.SENT, transport: MessageTransport.DUMMY }
    });
    expect(tx.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationStatus: MessageApplicationStatus.ACCEPTED,
        transport: MessageTransport.DUMMY,
        destination: "+15555550100",
        attemptCount: 1,
        createdAt: now
      })
    });
    const createdMessageData = tx.messageCreate.mock.calls[0]?.[0].data;
    expect(createdMessageData.idempotencyKey).toMatch(/^direct:v1:[A-Za-z0-9_-]{43}$/);
    expect(createdMessageData.idempotencyKey).not.toContain("message-once");
    expect(createdMessageData.requestFingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tx.attemptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: MessageAttemptStatus.QUEUED,
        transport: MessageTransport.DUMMY,
        dueAt: now,
        createdAt: now
      })
    });
    expect(tx.attemptUpdate).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({
        status: MessageAttemptStatus.SUCCEEDED,
        providerMessageId: expect.stringMatching(/^dummy_/)
      })
    });
    expect(mocks.enqueueCustomerWebhookEvent.mock.calls.map((call) => call[1].type)).toEqual([
      "message.accepted",
      "message.status.updated",
      "conversation.updated"
    ]);
  });

  it("leaves Twilio acceptance queued and never invokes provider create", async () => {
    const tx = transaction({ twilioReady: true });
    const result = await reserveDirectMessage(
      tx.client as never,
      publicInput(MessageTransport.TWILIO),
      dependencies()
    );

    expect(result).toMatchObject({
      ok: true,
      deduped: false,
      message: { applicationStatus: MessageApplicationStatus.ACCEPTED, transport: MessageTransport.TWILIO }
    });
    expect(tx.attemptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: MessageAttemptStatus.QUEUED,
        providerAccountId: "provider_account_1",
        providerPhoneNumberId: "provider_phone_1"
      })
    });
    expect(tx.attemptUpdate).not.toHaveBeenCalled();
    expect(tx.messageUpdate).not.toHaveBeenCalled();
  });

  it("returns the original permanent reservation without re-running current recipient gates", async () => {
    const tx = transaction();
    const first = await reserveDirectMessage(
      tx.client as never,
      publicInput(MessageTransport.DUMMY),
      dependencies()
    );
    expect(first.ok).toBe(true);
    tx.messageFindUnique.mockResolvedValueOnce(first.ok ? first.message : null);
    tx.contactFindFirst.mockClear();
    tx.attemptCreate.mockClear();

    const replay = await reserveDirectMessage(
      tx.client as never,
      publicInput(MessageTransport.DUMMY),
      dependencies()
    );

    expect(replay).toMatchObject({ ok: true, deduped: true, message: { id: "message_1" } });
    expect(tx.contactFindFirst).not.toHaveBeenCalled();
    expect(tx.attemptCreate).not.toHaveBeenCalled();
  });

  it("conflicts when a permanent identity is reused with changed content", async () => {
    const tx = transaction();
    const first = await reserveDirectMessage(
      tx.client as never,
      publicInput(MessageTransport.DUMMY),
      dependencies()
    );
    tx.messageFindUnique.mockResolvedValueOnce(first.ok ? first.message : null);

    await expect(
      reserveDirectMessage(
        tx.client as never,
        { ...publicInput(MessageTransport.DUMMY), body: "Changed" },
        dependencies()
      )
    ).resolves.toEqual({ ok: false, kind: "conflict" });
    expect(tx.attemptCreate).toHaveBeenCalledTimes(1);
  });

  it("requires explicit verified Twilio defaults and MMS capability", async () => {
    const tx = transaction({
      twilioReady: true,
      senderCapabilities: ["sms"],
      existingConversation: false
    });
    const result = await reserveDirectMessage(
      tx.client as never,
      { ...publicInput(MessageTransport.TWILIO), mediaUrls: ["https://cdn.example.test/a.jpg"] },
      dependencies()
    );

    expect(result).toEqual({
      ok: false,
      kind: "blocked",
      reasons: ["TWILIO_SENDER_MMS_UNAVAILABLE"]
    });
    expect(tx.messageCreate).not.toHaveBeenCalled();
    expect(tx.conversationCreate).not.toHaveBeenCalled();
  });

  it("rejects destinations longer than the E.164 maximum", async () => {
    const tx = transaction({ phone: "+1234567890123456" });

    await expect(
      reserveDirectMessage(tx.client as never, publicInput(MessageTransport.DUMMY), dependencies())
    ).resolves.toEqual({
      ok: false,
      kind: "blocked",
      reasons: ["CONTACT_PHONE_INVALID"]
    });
    expect(tx.messageCreate).not.toHaveBeenCalled();
  });

  it("keeps browser replies lenient for unknown consent while enforcing permanent UUID binding", async () => {
    const tx = transaction({ consentStatus: ConsentStatus.UNKNOWN });
    const result = await reserveDirectMessage(
      tx.client as never,
      {
        orgId: "org_1",
        route: "browser_inbox_reply",
        identity: { kind: "browser_inbox", requestId: "f8fdb7fa-8785-4c54-8bb2-30237d44f6b7" },
        transport: MessageTransport.DUMMY,
        conversationId: "conversation_1",
        body: "Agent reply"
      },
      dependencies()
    );

    expect(result).toMatchObject({ ok: true, message: { applicationStatus: MessageApplicationStatus.SENT } });

    tx.messageFindUnique.mockResolvedValueOnce(result.ok ? result.message : null);
    await expect(
      reserveDirectMessage(
        tx.client as never,
        {
          orgId: "org_1",
          route: "browser_inbox_reply",
          identity: { kind: "browser_inbox", requestId: "f8fdb7fa-8785-4c54-8bb2-30237d44f6b7" },
          transport: MessageTransport.DUMMY,
          conversationId: "conversation_2",
          body: "Agent reply"
        },
        dependencies()
      )
    ).resolves.toEqual({ ok: false, kind: "conflict" });
  });
});

describe("direct-message transport selection", () => {
  it("fails closed on unsupported values", () => {
    expect(resolveDirectMessageTransport({})).toBe(MessageTransport.DUMMY);
    expect(resolveDirectMessageTransport({ MESSAGING_PROVIDER: "twilio" })).toBe(MessageTransport.TWILIO);
    expect(resolveDirectMessageTransport({ MESSAGING_PROVIDER: "TWILIO" })).toBeNull();
  });
});

function publicInput(transport: MessageTransport) {
  return {
    orgId: "org_1",
    route: "public_direct" as const,
    identity: {
      kind: "public_api" as const,
      credentialId: "credential_1",
      idempotencyKey: "message-once"
    },
    transport,
    contactId: "contact_1",
    body: "Hello",
    mediaUrls: []
  };
}

function dependencies() {
  return {
    environment,
    now: () => now,
    randomId: () => "f44860ca-ec34-46a4-ae92-ce8bfe21cf70"
  };
}

function transaction(
  input: Readonly<{
    twilioReady?: boolean;
    senderCapabilities?: readonly string[];
    consentStatus?: ConsentStatus;
    existingConversation?: boolean;
    phone?: string;
  }> = {}
) {
  const conversation = {
    id: "conversation_1",
    orgId: "org_1",
    contactId: "contact_1",
    status: ConversationStatus.OPEN,
    updatedAt: now
  };
  const contact = {
    id: "contact_1",
    orgId: "org_1",
    phone: input.phone ?? "+15555550100",
    archivedAt: null,
    optedOutAt: null,
    consentStatus: input.consentStatus ?? ConsentStatus.OPTED_IN
  };
  let createdMessage: Record<string, unknown> | null = null;
  const messageCreate = vi.fn().mockImplementation(({ data }) => {
    createdMessage = {
      id: "message_1",
      createdAt: now,
      updatedAt: now,
      campaignId: null,
      providerMessageId: null,
      providerStatus: null,
      providerErrorCode: null,
      deliveredAt: null,
      failedAt: null,
      scheduledAt: null,
      sentAt: null,
      cancelledAt: null,
      ambiguousAt: null,
      ...data
    };
    return Promise.resolve(createdMessage);
  });
  const messageUpdate = vi.fn().mockImplementation(({ data }) => {
    createdMessage = { ...createdMessage, ...data };
    return Promise.resolve(createdMessage);
  });
  const messageFindUnique = vi.fn().mockResolvedValue(null);
  const attemptCreate = vi.fn().mockResolvedValue({ id: "attempt_1" });
  const attemptUpdate = vi.fn().mockResolvedValue({ id: "attempt_1" });
  const contactFindFirst = vi.fn().mockResolvedValue(contact);
  const conversationCreate = vi.fn().mockResolvedValue(conversation);
  return {
    messageCreate,
    messageUpdate,
    messageFindUnique,
    attemptCreate,
    attemptUpdate,
    contactFindFirst,
    conversationCreate,
    client: {
      $executeRaw: vi.fn().mockResolvedValue(1),
      message: { findUnique: messageFindUnique, create: messageCreate, update: messageUpdate },
      messageAttempt: { create: attemptCreate, update: attemptUpdate },
      contact: { findFirst: contactFindFirst },
      conversation: {
        findFirst: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.id === "conversation_1" ||
              (where.contactId === "contact_1" && input.existingConversation !== false)
              ? conversation
              : null
          )
        ),
        create: conversationCreate,
        update: vi.fn().mockResolvedValue(conversation)
      },
      providerAccount: {
        findFirst: vi.fn().mockResolvedValue(
          input.twilioReady
            ? {
                id: "provider_account_1",
                status: ProviderAccountStatus.VERIFIED,
                revokedAt: null,
                isDefault: true
              }
            : null
        )
      },
      providerPhoneNumber: {
        findFirst: vi.fn().mockResolvedValue(
          input.twilioReady
            ? {
                id: "provider_phone_1",
                status: ProviderPhoneNumberStatus.VERIFIED,
                disabledAt: null,
                isDefault: true,
                capabilities: input.senderCapabilities ?? ["sms", "mms"]
              }
            : null
        )
      }
    }
  };
}
