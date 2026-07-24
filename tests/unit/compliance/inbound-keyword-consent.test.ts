import { ConsentStatus, type Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processInboundKeywordsAndAutoReply } from "@/lib/db/repositories/inbox";

const mocks = vi.hoisted(() => ({
  contactUpdate: vi.fn(),
  contactUpdateMany: vi.fn(),
  conversationUpdate: vi.fn(),
  integrationAuditEventCreate: vi.fn(),
  messageUpsert: vi.fn(),
  providerSend: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

vi.mock("@/lib/messaging/provider/dummy-provider", () => ({
  dummyProvider: {
    name: "dummy",
    send: mocks.providerSend
  }
}));

function fakeTransaction() {
  return {
    contact: { update: mocks.contactUpdate, updateMany: mocks.contactUpdateMany },
    conversation: { update: mocks.conversationUpdate },
    message: { upsert: mocks.messageUpsert },
    integrationAuditEvent: { create: mocks.integrationAuditEventCreate },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(async () => [{ now: new Date() }]),
    customerWebhookSubscription: { findMany: vi.fn(async () => []) },
    customerWebhookEvent: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: "evt_1" })) },
    customerWebhookDelivery: { create: vi.fn() }
  } as unknown as Prisma.TransactionClient;
}

let transactionActive = false;

describe("inbound opt-in consent evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionActive = false;
    mocks.transaction.mockImplementation(async (callback) => {
      transactionActive = true;
      try {
        return await callback(fakeTransaction());
      } finally {
        transactionActive = false;
      }
    });
    mocks.contactUpdateMany.mockResolvedValue({ count: 1 });
    mocks.contactUpdate.mockResolvedValue({});
    mocks.providerSend.mockImplementation(async () => {
      expect(transactionActive).toBe(false);
      return { providerMessageId: "dummy_opt_in", status: "queued" };
    });
    mocks.messageUpsert.mockResolvedValue({ createdAt: new Date("2026-07-10T12:00:00.000Z") });
  });

  it("preserves complete write-once evidence when an opted-out contact replies START", async () => {
    const consentCapturedAt = new Date("2026-01-01T12:00:00.000Z");

    await processInboundKeywordsAndAutoReply(
      "org_1",
      {
        id: "contact_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_OUT,
        consentCapturedAt,
        consentMethod: "web_form",
        consentDisclosure: "Original verbatim disclosure"
      },
      "conversation_1",
      "OPT_IN",
      "twilio:inbound:SM-preserve"
    );

    expect(mocks.contactUpdateMany).toHaveBeenCalledTimes(1);
    const updateData = mocks.contactUpdateMany.mock.calls[0][0].data;
    expect(updateData).toEqual({
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null
    });
    expect(updateData).not.toHaveProperty("consentCapturedAt");
    expect(updateData).not.toHaveProperty("consentMethod");
    expect(updateData).not.toHaveProperty("consentDisclosure");
    expect(mocks.providerSend).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "opt-in-confirm:twilio:inbound:SM-preserve" })
    );
  });

  it("captures a complete evidence set when no prior evidence exists", async () => {
    await processInboundKeywordsAndAutoReply(
      "org_1",
      {
        id: "contact_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
        consentCapturedAt: null,
        consentMethod: null,
        consentDisclosure: null
      },
      "conversation_1",
      "OPT_IN",
      "twilio:inbound:SM-capture"
    );

    expect(mocks.contactUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_1",
        id: "contact_1",
        consentCapturedAt: null,
        consentMethod: null,
        consentDisclosure: null
      },
      data: {
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        consentCapturedAt: expect.any(Date),
        consentMethod: "SMS",
        consentDisclosure: "Contact replied with opt-in keyword to confirm subscription"
      }
    });
  });

  it("fails closed instead of mixing a new opt-in with partial historical evidence", async () => {
    await processInboundKeywordsAndAutoReply(
      "org_1",
      {
        id: "contact_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
        consentCapturedAt: new Date("2026-01-01T12:00:00.000Z"),
        consentMethod: null,
        consentDisclosure: null
      },
      "conversation_1",
      "OPT_IN",
      "twilio:inbound:SM-partial"
    );

    expect(mocks.contactUpdateMany).not.toHaveBeenCalled();
    expect(mocks.providerSend).not.toHaveBeenCalled();
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).not.toHaveBeenCalled();
  });

  it("does not confirm opt-in if evidence appears concurrently before the guarded update", async () => {
    mocks.contactUpdateMany.mockResolvedValue({ count: 0 });

    await processInboundKeywordsAndAutoReply(
      "org_1",
      {
        id: "contact_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
        consentCapturedAt: null,
        consentMethod: null,
        consentDisclosure: null
      },
      "conversation_1",
      "OPT_IN",
      "twilio:inbound:SM-race"
    );

    expect(mocks.contactUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.providerSend).not.toHaveBeenCalled();
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
  });

  it("applies keyword consent without creating a dummy reply when auto-replies are disabled", async () => {
    await processInboundKeywordsAndAutoReply(
      "org_1",
      {
        id: "contact_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        consentCapturedAt: new Date("2026-01-01T12:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "Original verbatim disclosure"
      },
      "conversation_1",
      "OPT_OUT",
      "twilio:inbound:SM-no-reply",
      { sendAutoReply: false }
    );

    expect(mocks.contactUpdate).toHaveBeenCalledWith({
      where: { id: "contact_1" },
      data: {
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: expect.any(Date)
      }
    });
    expect(mocks.providerSend).not.toHaveBeenCalled();
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).not.toHaveBeenCalled();
  });

  it("outputs compliant help text and records an audit event when contact replies HELP", async () => {
    await processInboundKeywordsAndAutoReply(
      "org_1",
      {
        id: "contact_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        consentCapturedAt: new Date("2026-01-01T12:00:00.000Z"),
        consentMethod: "web_form",
        consentDisclosure: "Original verbatim disclosure"
      },
      "conversation_1",
      "HELP",
      "twilio:inbound:SM-help"
    );

    expect(mocks.integrationAuditEventCreate).toHaveBeenCalledWith({
      data: {
        orgId: "org_1",
        action: "contact.help_requested",
        subjectType: "organization",
        subjectId: "org_1",
        metadata: { keyword: "HELP", phone: "+15555550100", contactId: "contact_1", source: "inbound_sms" }
      }
    });
    expect(mocks.providerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15555550100",
        body: expect.stringContaining("Reply STOP to unsubscribe"),
        idempotencyKey: "help-confirm:twilio:inbound:SM-help"
      })
    );
  });
});
