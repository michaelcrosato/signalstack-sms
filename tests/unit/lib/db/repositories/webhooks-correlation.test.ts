import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateMessageFromTwilioStatus } from "@/lib/db/repositories/webhooks";

const mocks = vi.hoisted(() => ({
  enqueueCustomerWebhookEvent: vi.fn(),
  lockedRows: vi.fn(),
  messageAttemptFindFirst: vi.fn(),
  messageAttemptUpdateMany: vi.fn(),
  messageUpdateMany: vi.fn()
}));

const transaction = {
  $queryRaw: mocks.lockedRows,
  message: { updateMany: mocks.messageUpdateMany },
  messageAttempt: {
    findFirst: mocks.messageAttemptFindFirst,
    updateMany: mocks.messageAttemptUpdateMany
  }
};

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: (_context: unknown, fn: (tx: typeof transaction) => unknown) =>
    fn(transaction)
}));

vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

const now = new Date("2026-07-12T12:00:00.000Z");
const createdAt = new Date("2026-07-12T11:00:00.000Z");
const correlation = {
  attemptId: "attempt_demo",
  correlationId: "3f32e2c5-9b0f-48ae-9510-d3d27acafed1",
  providerAccountId: "provider_account_demo",
  providerPhoneNumberId: "provider_number_demo",
  destination: "+15555550100"
} as const;

function selectedAttempt(
  overrides: Partial<{
    status: MessageAttemptStatus;
    completedAt: Date | null;
    providerMessageId: string | null;
    messageProviderMessageId: string | null;
    applicationStatus: MessageApplicationStatus;
    sentAt: Date | null;
    deliveredAt: Date | null;
    failedAt: Date | null;
  }> = {}
) {
  return {
    id: "attempt_demo",
    messageId: "message_demo",
    status: overrides.status ?? MessageAttemptStatus.PROCESSING,
    completedAt: overrides.completedAt ?? null,
    providerMessageId: overrides.providerMessageId ?? null,
    message: {
      id: "message_demo",
      contactId: "contact_demo",
      conversationId: "conversation_demo",
      applicationStatus: overrides.applicationStatus ?? MessageApplicationStatus.PROCESSING,
      transport: MessageTransport.TWILIO,
      providerMessageId: overrides.messageProviderMessageId ?? null,
      sentAt: overrides.sentAt ?? null,
      deliveredAt: overrides.deliveredAt ?? null,
      failedAt: overrides.failedAt ?? null,
      createdAt
    }
  };
}

describe("correlated Twilio status reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lockedRows.mockResolvedValue([{ id: "attempt_demo" }]);
    mocks.messageAttemptFindFirst.mockResolvedValue(selectedAttempt());
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    mocks.messageAttemptUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({ created: true });
  });

  it("atomically attaches a previously unpersisted SID and records delivered lifecycle events", async () => {
    await expect(
      updateMessageFromTwilioStatus({
        orgId: "org_demo",
        providerMessageId: "SM123",
        status: "delivered",
        now,
        correlation
      })
    ).resolves.toEqual({ matched: true, updated: true, createdAt });

    expect(mocks.messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "message_demo", orgId: "org_demo" }),
        data: expect.objectContaining({
          providerMessageId: "SM123",
          providerStatus: "delivered",
          applicationStatus: MessageApplicationStatus.DELIVERED,
          sentAt: now,
          deliveredAt: now,
          failedAt: null
        })
      })
    );
    expect(mocks.messageAttemptUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "attempt_demo",
          orgId: "org_demo",
          callbackCorrelationId: correlation.correlationId
        }),
        data: expect.objectContaining({
          providerMessageId: "SM123",
          providerStatus: "delivered",
          status: MessageAttemptStatus.SUCCEEDED,
          completedAt: now,
          processingToken: null,
          processingExpiresAt: null
        })
      })
    );
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueCustomerWebhookEvent.mock.calls.map((call) => call[1].type)).toEqual([
      "message.status.updated",
      "message.delivered"
    ]);
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenNthCalledWith(
      1,
      transaction,
      expect.objectContaining({ orgId: "org_demo", aggregateId: "message_demo" })
    );
  });

  it("fails closed without mutation when exact attempt binding does not match", async () => {
    mocks.messageAttemptFindFirst.mockResolvedValue(null);

    await expect(
      updateMessageFromTwilioStatus({
        orgId: "org_demo",
        providerMessageId: "SM123",
        status: "sent",
        correlation
      })
    ).resolves.toEqual({ matched: false, updated: false, createdAt: null });

    expect(mocks.messageAttemptFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org_demo",
          id: "attempt_demo",
          callbackCorrelationId: correlation.correlationId,
          providerAccountId: "provider_account_demo",
          providerPhoneNumberId: "provider_number_demo",
          destination: "+15555550100"
        })
      })
    );
    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
    expect(mocks.messageAttemptUpdateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueCustomerWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a callback SID that conflicts with either persisted exact binding", async () => {
    mocks.messageAttemptFindFirst.mockResolvedValue(
      selectedAttempt({ providerMessageId: "SM_DIFFERENT" })
    );

    await expect(
      updateMessageFromTwilioStatus({
        orgId: "org_demo",
        providerMessageId: "SM123",
        status: "sent",
        correlation
      })
    ).resolves.toEqual({ matched: false, updated: false, createdAt: null });

    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
    expect(mocks.messageAttemptUpdateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueCustomerWebhookEvent).not.toHaveBeenCalled();
  });

  it("keeps stale provider callbacks monotonic and emits no duplicate lifecycle event", async () => {
    mocks.messageAttemptFindFirst.mockResolvedValue(
      selectedAttempt({
        status: MessageAttemptStatus.SUCCEEDED,
        completedAt: now,
        providerMessageId: "SM123",
        messageProviderMessageId: "SM123",
        applicationStatus: MessageApplicationStatus.DELIVERED,
        sentAt: now
      })
    );
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateMessageFromTwilioStatus({
        orgId: "org_demo",
        providerMessageId: "SM123",
        status: "sent",
        correlation
      })
    ).resolves.toEqual({ matched: true, updated: false, createdAt });

    expect(mocks.messageAttemptUpdateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueCustomerWebhookEvent).not.toHaveBeenCalled();
  });

  it("preserves an existing terminal timestamp when replay evidence still advances", async () => {
    const firstDeliveredAt = new Date("2026-07-12T11:30:00.000Z");
    mocks.messageAttemptFindFirst.mockResolvedValue(
      selectedAttempt({
        status: MessageAttemptStatus.SUCCEEDED,
        completedAt: firstDeliveredAt,
        providerMessageId: "SM123",
        messageProviderMessageId: "SM123",
        applicationStatus: MessageApplicationStatus.DELIVERED,
        sentAt: firstDeliveredAt,
        deliveredAt: firstDeliveredAt
      })
    );

    await updateMessageFromTwilioStatus({
      orgId: "org_demo",
      providerMessageId: "SM123",
      status: "read",
      now,
      correlation
    });

    expect(mocks.messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: "read",
          deliveredAt: firstDeliveredAt,
          sentAt: firstDeliveredAt
        })
      })
    );
  });

  it("closes a processing attempt as failed for a terminal provider status", async () => {
    await updateMessageFromTwilioStatus({
      orgId: "org_demo",
      providerMessageId: "SM123",
      status: "undelivered",
      errorCode: "30007",
      now,
      correlation
    });

    expect(mocks.messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationStatus: MessageApplicationStatus.FAILED,
          providerErrorCode: "30007",
          failedAt: now
        })
      })
    );
    expect(mocks.messageAttemptUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageAttemptStatus.FAILED,
          errorCode: "TWILIO_STATUS_UNDELIVERED",
          disposition: "terminal"
        })
      })
    );
    expect(mocks.enqueueCustomerWebhookEvent.mock.calls.map((call) => call[1].type)).toEqual([
      "message.status.updated",
      "message.failed"
    ]);
  });
});
