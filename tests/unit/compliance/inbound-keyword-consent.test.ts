import { ConsentStatus, type Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processInboundKeywordsAndAutoReply } from "@/lib/db/repositories/inbox";

const mocks = vi.hoisted(() => ({
  contactUpdate: vi.fn(),
  contactUpdateMany: vi.fn(),
  conversationUpdate: vi.fn(),
  messageUpsert: vi.fn(),
  providerSend: vi.fn()
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
    message: { upsert: mocks.messageUpsert }
  } as unknown as Prisma.TransactionClient;
}

describe("inbound opt-in consent evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contactUpdateMany.mockResolvedValue({ count: 1 });
    mocks.contactUpdate.mockResolvedValue({});
    mocks.providerSend.mockResolvedValue({ providerMessageId: "dummy_opt_in", status: "queued" });
    mocks.messageUpsert.mockResolvedValue({ createdAt: new Date("2026-07-10T12:00:00.000Z") });
  });

  it("preserves complete write-once evidence when an opted-out contact replies START", async () => {
    const consentCapturedAt = new Date("2026-01-01T12:00:00.000Z");

    await processInboundKeywordsAndAutoReply(
      fakeTransaction(),
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
      fakeTransaction(),
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
      fakeTransaction(),
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
      fakeTransaction(),
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
      fakeTransaction(),
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
});
