import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueCustomerWebhookEvent: vi.fn() }));
vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

import { cancelDirectMessage } from "@/lib/messaging/direct-message-cancellation";

const now = new Date("2026-07-12T12:00:00.000Z");

function fixture(input: Readonly<{
  applicationStatus?: MessageApplicationStatus;
  attemptStatus?: MessageAttemptStatus;
  providerCallStartedAt?: Date | null;
}> = {}) {
  const attempt = {
    id: "attempt_1",
    orgId: "org_1",
    messageId: "message_1",
    attemptNumber: 1,
    status: input.attemptStatus ?? MessageAttemptStatus.QUEUED,
    transport: MessageTransport.TWILIO,
    providerCallStartedAt: input.providerCallStartedAt ?? null,
    completedAt: null
  };
  const message = {
    id: "message_1",
    orgId: "org_1",
    contactId: "contact_1",
    conversationId: "conversation_1",
    applicationStatus: input.applicationStatus ?? MessageApplicationStatus.ACCEPTED,
    providerStatus: null,
    providerErrorCode: null,
    attempts: [attempt]
  };
  const cancelled = {
    ...message,
    applicationStatus: MessageApplicationStatus.CANCELLED,
    cancelledAt: now
  };
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ now }]),
    message: {
      findFirst: vi.fn()
        .mockResolvedValueOnce(message)
        .mockResolvedValueOnce(message),
      update: vi.fn().mockResolvedValue(cancelled)
    },
    messageAttempt: {
      findFirst: vi.fn().mockResolvedValue(attempt),
      update: vi.fn().mockResolvedValue({ ...attempt, status: MessageAttemptStatus.CANCELLED })
    }
  };
  return { tx, message, attempt, cancelled };
}

describe("direct message cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({});
  });

  it("cancels queued and claimed pre-frontier attempts atomically", async () => {
    for (const attemptStatus of [MessageAttemptStatus.QUEUED, MessageAttemptStatus.PROCESSING]) {
      const { tx } = fixture({
        attemptStatus,
        applicationStatus:
          attemptStatus === MessageAttemptStatus.PROCESSING
            ? MessageApplicationStatus.PROCESSING
            : MessageApplicationStatus.ACCEPTED
      });
      await expect(cancelDirectMessage(tx as never, "org_1", "message_1")).resolves.toMatchObject({
        ok: true,
        alreadyCancelled: false,
        message: { applicationStatus: MessageApplicationStatus.CANCELLED }
      });
      expect(tx.messageAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: MessageAttemptStatus.CANCELLED,
          processingToken: null,
          processingExpiresAt: null
        })
      }));
      expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ type: "message.status.updated" })
      );
    }
  });

  it("conflicts at or after the provider-call frontier without mutation", async () => {
    const { tx } = fixture({
      applicationStatus: MessageApplicationStatus.PROCESSING,
      attemptStatus: MessageAttemptStatus.PROCESSING,
      providerCallStartedAt: now
    });
    await expect(cancelDirectMessage(tx as never, "org_1", "message_1"))
      .resolves.toEqual({ ok: false, kind: "conflict" });
    expect(tx.messageAttempt.update).not.toHaveBeenCalled();
    expect(tx.message.update).not.toHaveBeenCalled();
  });

  it("returns a stable no-op for an already cancelled message", async () => {
    const { tx, message } = fixture({ applicationStatus: MessageApplicationStatus.CANCELLED });
    await expect(cancelDirectMessage(tx as never, "org_1", "message_1")).resolves.toMatchObject({
      ok: true,
      alreadyCancelled: true,
      message
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("does not reveal foreign or missing messages", async () => {
    const { tx } = fixture();
    tx.message.findFirst.mockReset().mockResolvedValue(null);
    await expect(cancelDirectMessage(tx as never, "org_1", "missing"))
      .resolves.toEqual({ ok: false, kind: "not_found" });
  });
});
