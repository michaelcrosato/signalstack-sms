import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attestDeliveryAttemptNotSent,
  listDeliveryAttempts,
  reconcileDeliveryAttempt,
  retryAttestedDeliveryAttempt
} from "@/lib/messaging/delivery-attempt-review";

const mocks = vi.hoisted(() => ({ enqueueCustomerWebhookEvent: vi.fn() }));

vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

const now = new Date("2026-07-12T18:00:00.000Z");
const createdAt = new Date("2026-07-12T17:00:00.000Z");

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "message_demo",
    orgId: "org_demo",
    contactId: "contact_demo",
    conversationId: "conversation_demo",
    applicationStatus: MessageApplicationStatus.AMBIGUOUS,
    providerMessageId: null,
    providerStatus: null,
    providerErrorCode: null,
    acceptedAt: createdAt,
    scheduledAt: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    ambiguousAt: createdAt,
    attemptCount: 1,
    ...overrides
  };
}

function reviewAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt_demo",
    orgId: "org_demo",
    messageId: "message_demo",
    attemptNumber: 1,
    status: MessageAttemptStatus.AMBIGUOUS,
    transport: MessageTransport.TWILIO,
    destination: "+15555550100",
    dueAt: createdAt,
    claimedAt: createdAt,
    providerCallStartedAt: createdAt,
    providerMessageId: null,
    providerStatus: null,
    providerErrorCode: null,
    completedAt: createdAt,
    reconciledAt: null,
    createdAt,
    updatedAt: createdAt,
    providerPhoneNumber: { phoneNumber: "+15555550199" },
    retries: [],
    message: message(),
    ...overrides
  };
}

function fullAttempt(overrides: Record<string, unknown> = {}) {
  return {
    ...reviewAttempt(),
    body: "Sensitive message body",
    mediaUrls: [],
    requestFingerprint: "request-fingerprint-demo",
    callbackCorrelationId: "3f32e2c5-9b0f-48ae-9510-d3d27acafed1",
    retryOfAttemptId: null,
    providerAccountId: "provider_account_demo",
    providerCredentialSecretId: "provider_secret_old",
    providerCredentialVersion: 1,
    providerPhoneNumberId: "provider_number_demo",
    processingToken: null,
    processingExpiresAt: null,
    errorCode: "PROVIDER_RESULT_PERSISTENCE_UNCERTAIN",
    disposition: "ambiguous",
    reconciliationNote: null,
    message: message(),
    ...overrides
  };
}

function createTx() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]),
    integrationAuditEvent: { create: vi.fn().mockResolvedValue({ id: "audit_demo" }) },
    message: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    messageAttempt: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    providerAccount: { findFirst: vi.fn() },
    providerCredentialSecret: { findFirst: vi.fn() },
    providerPhoneNumber: { findFirst: vi.fn() }
  };
}

function transactionFor(tx: ReturnType<typeof createTx>) {
  return vi.fn(async (_context: unknown, callback: (client: typeof tx) => unknown) => callback(tx));
}

describe("M5 delivery-attempt review service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({ created: true });
  });

  it("returns bounded redacted review DTOs without payload, credential, or correlation evidence", async () => {
    const tx = createTx();
    tx.messageAttempt.findMany.mockResolvedValue([
      reviewAttempt({
        providerMessageId: "SM123",
        providerStatus: "sent",
        providerErrorCode: "30007"
      })
    ]);

    const result = await listDeliveryAttempts(
      "org_demo",
      { requiresReview: true, limit: 25 },
      { transaction: transactionFor(tx) as never }
    );

    expect(result.nextCursor).toBeNull();
    expect(result.attempts[0]).toMatchObject({
      id: "attempt_demo",
      messageId: "message_demo",
      destinationLastFour: "0100",
      senderLastFour: "0199",
      hasProviderMessageId: true,
      requiresReview: true,
      canReconcile: true,
      canAttestNotSent: false
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Sensitive message body");
    expect(serialized).not.toContain("provider_account_demo");
    expect(serialized).not.toContain("callbackCorrelationId");
    expect(tx.messageAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org_demo",
          AND: [{ status: MessageAttemptStatus.AMBIGUOUS }]
        },
        take: 26,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    );
  });

  it("fetches a known SID and atomically converges exact provider evidence with audit/events", async () => {
    const tx = createTx();
    const accountSid = `AC${"a".repeat(32)}`;
    tx.messageAttempt.findFirst
      .mockResolvedValueOnce(
        fullAttempt({
          providerMessageId: `SM${"b".repeat(32)}`,
          providerAccount: {
            id: "provider_account_demo",
            provider: "twilio",
            status: ProviderAccountStatus.VERIFIED,
            revokedAt: null,
            externalAccountId: accountSid,
            externalAccountIdHash: `pvlookup_v1_${"c".repeat(43)}`
          },
          providerPhoneNumber: {
            id: "provider_number_demo",
            providerAccountId: "provider_account_demo",
            status: ProviderPhoneNumberStatus.VERIFIED,
            disabledAt: null,
            phoneNumber: "+15555550199"
          }
        })
      )
      .mockResolvedValueOnce(
        fullAttempt({ providerMessageId: `SM${"b".repeat(32)}` })
      )
      .mockResolvedValueOnce(
        reviewAttempt({
          status: MessageAttemptStatus.SUCCEEDED,
          providerMessageId: `SM${"b".repeat(32)}`,
          providerStatus: "delivered",
          reconciledAt: now,
          message: message({
            applicationStatus: MessageApplicationStatus.DELIVERED,
            providerMessageId: `SM${"b".repeat(32)}`,
            sentAt: now,
            deliveredAt: now
          })
        })
      );
    tx.providerCredentialSecret.findFirst
      .mockResolvedValueOnce({
        id: "provider_secret_current",
        version: 2,
        envelopeVersion: 1,
        algorithm: "aes-256-gcm",
        keyVersion: 1,
        iv: "iv",
        ciphertext: "ciphertext",
        authTag: "auth-tag",
        fingerprint: "pvfp_demo"
      })
      .mockResolvedValueOnce({ id: "provider_secret_current" });
    tx.providerAccount.findFirst.mockResolvedValue({ externalAccountId: accountSid });
    tx.providerPhoneNumber.findFirst.mockResolvedValue({ id: "provider_number_demo" });
    const fetchMessage = vi.fn().mockResolvedValue({
      providerMessageId: `SM${"b".repeat(32)}`,
      externalAccountId: accountSid,
      status: { status: "delivered", providerStatus: "delivered" },
      to: "+15555550100",
      from: "+15555550199",
      messagingServiceId: null,
      providerErrorCode: null,
      createdAt: createdAt.toISOString(),
      sentAt: now.toISOString()
    });
    const createAdapter = vi.fn().mockReturnValue({ fetchMessage });

    const result = await reconcileDeliveryAttempt(
      { orgId: "org_demo", attemptId: "attempt_demo", actorUserId: "user_admin" },
      {
        transaction: transactionFor(tx) as never,
        createAdapter: createAdapter as never,
        now: () => now
      }
    );

    expect(result.applicationStatus).toBe(MessageApplicationStatus.DELIVERED);
    expect(fetchMessage).toHaveBeenCalledWith({ providerMessageId: `SM${"b".repeat(32)}` });
    expect(tx.providerCredentialSecret.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ activeFrom: { lte: now }, retiredAt: null })
      })
    );
    expect(tx.providerCredentialSecret.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ activeFrom: { lte: now }, retiredAt: null })
      })
    );
    expect(tx.messageAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageAttemptStatus.SUCCEEDED,
          providerStatus: "delivered",
          reconciledAt: now,
          reconciledByUserId: "user_admin"
        })
      })
    );
    expect(tx.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationStatus: MessageApplicationStatus.DELIVERED,
          providerMessageId: `SM${"b".repeat(32)}`,
          sentAt: now,
          deliveredAt: now
        })
      })
    );
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenCalledTimes(2);
    expect(tx.integrationAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org_demo",
        actorUserId: "user_admin",
        action: "MESSAGE_ATTEMPT_RECONCILED",
        subjectType: "message_attempt",
        subjectId: "attempt_demo"
      })
    });
  });

  it("attests only ambiguous no-SID evidence and keeps the bounded reason internal", async () => {
    const tx = createTx();
    tx.messageAttempt.findFirst
      .mockResolvedValueOnce(fullAttempt({ retries: [] }))
      .mockResolvedValueOnce(
        reviewAttempt({
          status: MessageAttemptStatus.RESOLVED_NOT_SENT,
          reconciledAt: now
        })
      );
    const reason = "Carrier and recipient records confirm no provider message was created.";

    const result = await attestDeliveryAttemptNotSent(
      {
        orgId: "org_demo",
        attemptId: "attempt_demo",
        actorUserId: "user_admin",
        reason
      },
      { transaction: transactionFor(tx) as never, now: () => now }
    );

    expect(result.attemptStatus).toBe(MessageAttemptStatus.RESOLVED_NOT_SENT);
    expect(tx.messageAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageAttemptStatus.RESOLVED_NOT_SENT,
          reconciliationNote: reason,
          reconciledByUserId: "user_admin"
        })
      })
    );
    const auditJson = JSON.stringify(tx.integrationAuditEvent.create.mock.calls);
    expect(auditJson).toContain("MESSAGE_ATTEMPT_ATTESTED_NOT_SENT");
    expect(auditJson).not.toContain(reason);
    expect(JSON.stringify(result)).not.toContain(reason);
  });

  it("creates one ordinary queued successor only after NOT_SENT attestation", async () => {
    const tx = createTx();
    const parent = fullAttempt({
      status: MessageAttemptStatus.RESOLVED_NOT_SENT,
      reconciledAt: createdAt,
      reconciliationNote: "Internal attestation reason.",
      retries: [],
      message: message({ scheduledAt: createdAt })
    });
    tx.messageAttempt.findFirst
      .mockResolvedValueOnce(parent)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        reviewAttempt({
          id: "attempt_successor",
          attemptNumber: 2,
          status: MessageAttemptStatus.QUEUED,
          providerCallStartedAt: null,
          completedAt: null,
          message: message({
            applicationStatus: MessageApplicationStatus.SCHEDULED,
            scheduledAt: now,
            attemptCount: 2
          })
        })
      );
    tx.messageAttempt.create.mockResolvedValue({
      id: "attempt_successor",
      attemptNumber: 2
    });
    const randomId = vi
      .fn()
      .mockReturnValueOnce("attempt_successor")
      .mockReturnValueOnce("3f32e2c5-9b0f-48ae-9510-d3d27acafed1");

    const result = await retryAttestedDeliveryAttempt(
      { orgId: "org_demo", attemptId: "attempt_demo", actorUserId: "user_admin" },
      { transaction: transactionFor(tx) as never, now: () => now, randomId }
    );

    expect(result.id).toBe("attempt_successor");
    expect(tx.messageAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "attempt_successor",
        retryOfAttemptId: "attempt_demo",
        attemptNumber: 2,
        status: MessageAttemptStatus.QUEUED,
        dueAt: now,
        providerAccountId: "provider_account_demo",
        providerPhoneNumberId: "provider_number_demo"
      })
    });
    const successorData = tx.messageAttempt.create.mock.calls[0]![0].data;
    expect(successorData).not.toHaveProperty("providerCredentialSecretId");
    expect(successorData).not.toHaveProperty("providerCallStartedAt");
    expect(tx.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationStatus: MessageApplicationStatus.SCHEDULED,
          scheduledAt: now,
          attemptCount: 2
        })
      })
    );
    expect(tx.integrationAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "MESSAGE_ATTEMPT_RETRY_CREATED" })
    });
  });
});
