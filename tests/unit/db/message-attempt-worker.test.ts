import { randomUUID } from "node:crypto";
import {
  A2pRegistrationStatus,
  ConsentStatus,
  MembershipRole,
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  Prisma,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { updateMessageFromTwilioStatus } from "@/lib/db/repositories/webhooks";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  createProviderCredentialEnvelope,
  hashProviderLookupIdentifier
} from "@/lib/integrations/provider-accounts/credential-encryption";
import {
  finalizeClaimedDirectMessageAttempt,
  markDirectMessageResultPersistenceAmbiguous,
  prepareClaimedDirectMessageAttempt,
  processClaimedDirectMessageAttempt
} from "@/lib/messaging/outbox/worker";
import { isWithinQuietHours } from "@/lib/compliance/quiet-hours";
import {
  attestDeliveryAttemptNotSent,
  reconcileDeliveryAttempt,
  retryAttestedDeliveryAttempt
} from "@/lib/messaging/delivery-attempt-review";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "");
const masterKey = Buffer.alloc(32, 7);
const accountSid = `AC${suffix.slice(0, 32)}`;
const phoneSid = `PN${suffix.slice(0, 32)}`;
const accountId = `m5w_account_${suffix}`;
const secretId = `m5w_secret_${suffix}`;
const senderId = `m5w_sender_${suffix}`;
const destination = "+12125550100";
const senderNumber = "+12125550199";
let orgId = "";
let crossOrgId = "";
let contactId = "";
let adminUserId = "";

const liveEnvironment = Object.freeze({
  WORKER_ENABLED: "true",
  WORKER_DEPLOYMENT_CLASS: "production-live-direct",
  RUNTIME_PROCESS: "worker",
  DEMO_MODE: "false",
  LIVE_MESSAGING_ENABLED: "true",
  MESSAGING_PROVIDER: "twilio",
  NEXT_PUBLIC_APP_URL: "https://sms.example.test",
  SECRETS_MASTER_KEY: masterKey.toString("base64"),
  NODE_ENV: "production"
});

describe.runIf(run)("M5 direct-message worker database transitions", () => {
  beforeAll(async () => {
    const now = new Date();
    const org = await prisma.organization.create({
      data: {
        name: "M5 worker integration",
        slug: `m5-worker-${suffix}`,
        demoMode: false,
        timezone: "America/New_York"
      }
    });
    orgId = org.id;
    crossOrgId = (await prisma.organization.create({
      data: {
        name: "M5 worker cross-tenant integration",
        slug: `m5-worker-cross-${suffix}`,
        demoMode: false,
        timezone: "America/New_York"
      }
    })).id;
    const contact = await prisma.contact.create({
      data: {
        orgId,
        phone: destination,
        consentStatus: ConsentStatus.OPTED_IN,
        optInAt: now,
        consentCapturedAt: now,
        consentMethod: "WEB_FORM",
        consentDisclosure: "I agree to receive recurring automated text messages."
      }
    });
    contactId = contact.id;
    const admin = await prisma.appUser.create({
      data: {
        email: `m5-worker-${suffix}@example.test`,
        normalizedEmail: `m5-worker-${suffix}@example.test`,
        displayName: "M5 Worker Admin",
        emailVerifiedAt: now
      }
    });
    adminUserId = admin.id;
    await prisma.membership.create({
      data: { orgId, userId: admin.id, role: MembershipRole.ADMIN }
    });
    await prisma.complianceProfile.create({
      data: {
        orgId,
        businessName: "M5 Worker Test",
        messagingUseCase: "Customer support notifications",
        optInDescription: "Customer submitted the web consent form.",
        privacyPolicyUrl: "https://sms.example.test/privacy",
        termsOfServiceUrl: "https://sms.example.test/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
      }
    });
    const externalAccountIdHash = hashProviderLookupIdentifier({
      masterKey,
      provider: "twilio",
      kind: "account",
      value: accountSid
    });
    await prisma.providerAccount.create({
      data: {
        id: accountId,
        orgId,
        provider: "twilio",
        externalAccountId: accountSid,
        externalAccountIdHash,
        externalAccountIdLast4: accountSid.slice(-4),
        status: ProviderAccountStatus.VERIFIED,
        isDefault: true,
        accountStatus: "active",
        verifiedAt: now,
        lastCheckedAt: now
      }
    });
    const envelope = createProviderCredentialEnvelope({
      secret: "t".repeat(32),
      masterKey,
      keyVersion: 1,
      binding: {
        orgId,
        provider: "twilio",
        externalAccountId: accountSid,
        externalAccountIdHash,
        providerAccountId: accountId,
        secretId,
        credentialVersion: 1
      },
      dependencies: { randomBytes: (size) => Buffer.alloc(size, 5) }
    });
    await prisma.providerCredentialSecret.create({
      data: {
        id: secretId,
        orgId,
        providerAccountId: accountId,
        version: 1,
        ...envelope
      }
    });
    await prisma.providerPhoneNumber.create({
      data: {
        id: senderId,
        orgId,
        phoneNumber: senderNumber,
        phoneNumberHash: hashProviderLookupIdentifier({
          masterKey,
          provider: "twilio",
          kind: "phone_number",
          value: senderNumber
        }),
        provider: "twilio",
        providerAccountId: accountId,
        externalNumberId: phoneSid,
        externalNumberIdLast4: phoneSid.slice(-4),
        status: ProviderPhoneNumberStatus.VERIFIED,
        capabilities: ["sms", "mms"],
        isDefault: true,
        verifiedAt: now,
        lastCheckedAt: now
      }
    });
  });

  afterAll(async () => {
    if (orgId || crossOrgId) {
      await prisma.organization.deleteMany({
        where: { id: { in: [orgId, crossOrgId].filter(Boolean) } }
      });
    }
    if (adminUserId) await prisma.appUser.deleteMany({ where: { id: adminUserId } });
  });

  it("completes the deterministic dummy path without a provider-call frontier", async () => {
    const fixture = await processingAttempt("dummy", MessageTransport.DUMMY, new Date(Date.now() + 60_000));
    await expect(processClaimedDirectMessageAttempt(fixture.claim)).resolves.toBe("sent");
    const stored = await withTenantTransaction({ orgId }, async (tx) => ({
      attempt: await tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
      message: await tx.message.findUniqueOrThrow({ where: { id: fixture.messageId } })
    }));
    expect(stored.attempt).toMatchObject({
      status: MessageAttemptStatus.SUCCEEDED,
      providerCallStartedAt: null,
      processingToken: null,
      disposition: "success",
      providerMessageId: `dummy_${fixture.requestFingerprint}`
    });
    expect(stored.message).toMatchObject({
      applicationStatus: MessageApplicationStatus.SENT,
      attemptCount: 1
    });
  });

  it("rechecks the live deployment gate before the frontier and cancels unauthorized ownership", async () => {
    const clock = nextAllowedEasternTime();
    const fixture = await processingAttempt("blocked", MessageTransport.TWILIO, new Date(clock.getTime() + 60_000));
    const result = await prepareClaimedDirectMessageAttempt(fixture.claim, {
      environment: { ...liveEnvironment, WORKER_DEPLOYMENT_CLASS: "local-demo" },
      transaction: transactionAt(clock)
    });
    expect(result).toEqual({ outcome: "cancelled" });
    const attempt = await withTenantTransaction({ orgId }, (tx) =>
      tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } })
    );
    expect(attempt).toMatchObject({
      status: MessageAttemptStatus.CANCELLED,
      providerCallStartedAt: null,
      providerCredentialSecretId: null,
      errorCode: "LIVE_WORKER_NOT_AUTHORIZED"
    });
  });

  it("denies a live frontier when the current organization remains in demo mode", async () => {
    const clock = nextAllowedEasternTime();
    await prisma.organization.update({ where: { id: orgId }, data: { demoMode: true } });
    try {
      const fixture = await processingAttempt("demo-org", MessageTransport.TWILIO, new Date(clock.getTime() + 60_000));
      const result = await prepareClaimedDirectMessageAttempt(fixture.claim, {
        environment: liveEnvironment,
        transaction: transactionAt(clock)
      });
      expect(result).toEqual({ outcome: "cancelled" });
      const stored = await withTenantTransaction({ orgId }, async (tx) => ({
        attempt: await tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
        message: await tx.message.findUniqueOrThrow({ where: { id: fixture.messageId } })
      }));
      expect(stored.attempt).toMatchObject({
        status: MessageAttemptStatus.CANCELLED,
        providerCallStartedAt: null,
        providerCredentialSecretId: null,
        errorCode: "MESSAGING_HARD_GATE_BLOCKED"
      });
      expect(stored.message.applicationStatus).toBe(MessageApplicationStatus.CANCELLED);
    } finally {
      await prisma.organization.update({ where: { id: orgId }, data: { demoMode: false } });
    }
  });

  it("commits exact authority at the frontier and creates one definitive retry successor", async () => {
    const clock = nextAllowedEasternTime();
    const fixture = await processingAttempt("retry", MessageTransport.TWILIO, new Date(clock.getTime() + 60_000));
    const preparedResult = await prepareClaimedDirectMessageAttempt(fixture.claim, {
      environment: liveEnvironment,
      transaction: transactionAt(clock)
    });
    expect(preparedResult.outcome).toBe("prepared");
    if (preparedResult.outcome !== "prepared") throw new Error("Expected a prepared attempt.");
    const prepared = preparedResult.prepared;
    expect(prepared).toMatchObject({
      providerCallStartedAt: clock,
      providerPhoneNumberId: senderId,
      from: senderNumber,
      providerSnapshot: {
        providerAccountId: accountId,
        providerCredentialSecretId: secretId,
        providerCredentialVersion: 1
      }
    });
    const frontier = await withTenantTransaction({ orgId }, (tx) =>
      tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } })
    );
    expect(frontier).toMatchObject({
      status: MessageAttemptStatus.PROCESSING,
      providerCallStartedAt: clock,
      providerCredentialSecretId: secretId,
      providerCredentialVersion: 1,
      processingToken: fixture.claim.processingToken
    });

    const retryAt = new Date(clock.getTime() + 5_000);
    const decision = {
      outcome: "retry" as const,
      errorCode: "TWILIO_20429",
      providerErrorCode: "TWILIO_20429",
      disposition: "retryable" as const,
      nextAttemptAt: retryAt
    };
    await expect(finalizeClaimedDirectMessageAttempt(
      fixture.claim,
      prepared,
      decision,
      { transaction: transactionAt(new Date(clock.getTime() + 100)) }
    )).resolves.toBe(true);
    await expect(finalizeClaimedDirectMessageAttempt(
      fixture.claim,
      prepared,
      decision,
      { transaction: transactionAt(new Date(clock.getTime() + 200)) }
    )).resolves.toBe(false);

    const stored = await withTenantTransaction({ orgId }, async (tx) => ({
      message: await tx.message.findUniqueOrThrow({ where: { id: fixture.messageId } }),
      attempts: await tx.messageAttempt.findMany({
        where: { messageId: fixture.messageId },
        orderBy: { attemptNumber: "asc" }
      })
    }));
    expect(stored.message).toMatchObject({
      applicationStatus: MessageApplicationStatus.SCHEDULED,
      attemptCount: 2,
      scheduledAt: retryAt
    });
    expect(stored.attempts).toHaveLength(2);
    expect(stored.attempts[0]).toMatchObject({
      status: MessageAttemptStatus.FAILED,
      disposition: "retryable",
      providerCallStartedAt: clock
    });
    expect(stored.attempts[1]).toMatchObject({
      attemptNumber: 2,
      retryOfAttemptId: fixture.attemptId,
      status: MessageAttemptStatus.QUEUED,
      dueAt: retryAt,
      providerCredentialSecretId: null,
      providerCallStartedAt: null
    });
  });

  it("persists a correlated terminal callback with database-safe evidence", async () => {
    const clock = nextAllowedEasternTime();
    const fixture = await processingAttempt("callback", MessageTransport.TWILIO, new Date(clock.getTime() + 60_000));
    const preparedResult = await prepareClaimedDirectMessageAttempt(fixture.claim, {
      environment: liveEnvironment,
      transaction: transactionAt(clock)
    });
    if (preparedResult.outcome !== "prepared") throw new Error("Expected a prepared attempt.");
    const providerMessageId = `SM${"c".repeat(32)}`;

    const callback = {
      orgId,
      providerMessageId,
      status: "undelivered",
      errorCode: "30007",
      now: new Date(clock.getTime() + 100),
      correlation: {
        attemptId: fixture.attemptId,
        correlationId: preparedResult.prepared.callbackCorrelationId,
        providerAccountId: accountId,
        providerPhoneNumberId: senderId,
        destination
      }
    } as const;
    const duplicateResults = await Promise.all([
      updateMessageFromTwilioStatus(callback),
      updateMessageFromTwilioStatus(callback)
    ]);
    expect(duplicateResults.every((result) => result.matched)).toBe(true);
    expect(duplicateResults.some((result) => result.updated)).toBe(true);
    await expect(updateMessageFromTwilioStatus({
      ...callback,
      status: "sent",
      errorCode: undefined,
      now: new Date(clock.getTime() + 200)
    })).resolves.toMatchObject({ matched: true, updated: false });
    await expect(updateMessageFromTwilioStatus({
      ...callback,
      orgId: crossOrgId
    })).resolves.toMatchObject({ matched: false, updated: false });

    const stored = await withTenantTransaction({ orgId }, async (tx) => ({
      attempt: await tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
      message: await tx.message.findUniqueOrThrow({ where: { id: fixture.messageId } })
    }));
    expect(stored.attempt).toMatchObject({
      status: MessageAttemptStatus.FAILED,
      providerMessageId,
      providerStatus: "undelivered",
      providerErrorCode: "30007",
      errorCode: "TWILIO_STATUS_UNDELIVERED",
      disposition: "terminal",
      processingToken: null
    });
    expect(stored.message).toMatchObject({
      applicationStatus: MessageApplicationStatus.FAILED,
      providerMessageId,
      providerStatus: "undelivered",
      providerErrorCode: "30007"
    });
    expect(await prisma.customerWebhookEvent.count({
      where: {
        orgId,
        aggregateId: fixture.messageId,
        type: "message.status.updated"
      }
    })).toBe(1);
    expect(await prisma.customerWebhookEvent.count({
      where: { orgId, aggregateId: fixture.messageId, type: "message.failed" }
    })).toBe(1);
  });

  it("reconciles known-SID ambiguity through provider fetch without creating", async () => {
    const clock = nextAllowedEasternTime();
    const fixture = await processingAttempt("fetch", MessageTransport.TWILIO, new Date(clock.getTime() + 60_000));
    const preparedResult = await prepareClaimedDirectMessageAttempt(fixture.claim, {
      environment: liveEnvironment,
      transaction: transactionAt(clock)
    });
    if (preparedResult.outcome !== "prepared") throw new Error("Expected a prepared attempt.");
    const providerMessageId = `SM${"e".repeat(32)}`;
    const ambiguousAt = new Date(clock.getTime() + 100);
    await withTenantTransaction({ orgId }, async (tx) => {
      await tx.messageAttempt.update({
        where: { id: fixture.attemptId },
        data: {
          status: MessageAttemptStatus.AMBIGUOUS,
          providerMessageId,
          providerStatus: "queued",
          errorCode: "PROVIDER_RESULT_PERSISTENCE_UNCERTAIN",
          disposition: "ambiguous",
          completedAt: ambiguousAt,
          processingToken: null,
          processingExpiresAt: null
        }
      });
      await tx.message.update({
        where: { id: fixture.messageId },
        data: {
          applicationStatus: MessageApplicationStatus.AMBIGUOUS,
          providerMessageId,
          providerStatus: "queued",
          ambiguousAt
        }
      });
    });
    const fetchMessage = vi.fn().mockResolvedValue({
      providerMessageId,
      externalAccountId: accountSid,
      status: { status: "delivered", providerStatus: "delivered" },
      to: destination,
      from: senderNumber,
      messagingServiceId: null,
      providerErrorCode: null,
      createdAt: clock.toISOString(),
      sentAt: clock.toISOString()
    });
    const createMessage = vi.fn();

    const result = await reconcileDeliveryAttempt({
      orgId,
      attemptId: fixture.attemptId,
      actorUserId: adminUserId
    }, {
      now: () => new Date(clock.getTime() + 200),
      createAdapter: () => ({ fetchMessage, createMessage }) as never
    });

    expect(result).toMatchObject({
      applicationStatus: MessageApplicationStatus.DELIVERED,
      attemptStatus: MessageAttemptStatus.SUCCEEDED,
      requiresReview: false
    });
    expect(fetchMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).not.toHaveBeenCalled();
    const stored = await withTenantTransaction({ orgId }, async (tx) => ({
      attempt: await tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
      message: await tx.message.findUniqueOrThrow({ where: { id: fixture.messageId } }),
      audits: await tx.integrationAuditEvent.count({
        where: {
          orgId,
          subjectType: "message_attempt",
          subjectId: fixture.attemptId,
          action: "MESSAGE_ATTEMPT_RECONCILED"
        }
      })
    }));
    expect(stored.attempt).toMatchObject({
      status: MessageAttemptStatus.SUCCEEDED,
      providerMessageId,
      providerStatus: "delivered",
      disposition: "success",
      reconciledByUserId: adminUserId
    });
    expect(stored.message).toMatchObject({
      applicationStatus: MessageApplicationStatus.DELIVERED,
      providerMessageId,
      providerStatus: "delivered"
    });
    expect(stored.audits).toBe(1);
  });

  it("persists ambiguity, then proves audited ADMIN attestation and one retry", async () => {
    const clock = nextAllowedEasternTime();
    const fixture = await processingAttempt("ambiguous", MessageTransport.TWILIO, new Date(clock.getTime() + 60_000));
    const preparedResult = await prepareClaimedDirectMessageAttempt(fixture.claim, {
      environment: liveEnvironment,
      transaction: transactionAt(clock)
    });
    if (preparedResult.outcome !== "prepared") throw new Error("Expected a prepared attempt.");
    const providerCreate = vi.fn().mockResolvedValue({
      providerMessageId: `SM${"d".repeat(32)}`,
      externalAccountId: accountSid,
      status: { status: "queued", providerStatus: "queued" },
      to: destination,
      from: senderNumber,
      messagingServiceId: null,
      providerErrorCode: null
    });
    await expect(processClaimedDirectMessageAttempt(fixture.claim, {
      prepare: vi.fn().mockResolvedValue(preparedResult),
      createAdapter: () => ({ createMessage: providerCreate }) as never,
      finalize: vi.fn().mockRejectedValue(new Error("result commit lost")),
      markPersistenceAmbiguous: vi.fn().mockRejectedValue(new Error("process terminated"))
    })).rejects.toThrow("result commit lost");
    expect(providerCreate).toHaveBeenCalledTimes(1);

    const crashed = await withTenantTransaction({ orgId }, (tx) =>
      tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } })
    );
    expect(crashed).toMatchObject({
      status: MessageAttemptStatus.PROCESSING,
      providerCallStartedAt: clock,
      processingToken: fixture.claim.processingToken
    });
    await expect(markDirectMessageResultPersistenceAmbiguous(
      fixture.claim,
      preparedResult.prepared,
      { transaction: transactionAt(new Date(clock.getTime() + 100)) }
    )).resolves.toBe(true);
    await expect(markDirectMessageResultPersistenceAmbiguous(
      fixture.claim,
      preparedResult.prepared,
      { transaction: transactionAt(new Date(clock.getTime() + 200)) }
    )).resolves.toBe(false);
    expect(providerCreate).toHaveBeenCalledTimes(1);

    const stored = await withTenantTransaction({ orgId }, async (tx) => ({
      attempt: await tx.messageAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
      message: await tx.message.findUniqueOrThrow({ where: { id: fixture.messageId } })
    }));
    expect(stored.attempt).toMatchObject({
      status: MessageAttemptStatus.AMBIGUOUS,
      errorCode: "PROVIDER_RESULT_PERSISTENCE_UNCERTAIN",
      disposition: "ambiguous",
      providerMessageId: null,
      processingToken: null
    });
    expect(stored.message).toMatchObject({
      applicationStatus: MessageApplicationStatus.AMBIGUOUS,
      attemptCount: 1
    });

    const attestedAt = new Date(clock.getTime() + 200);
    const attested = await attestDeliveryAttemptNotSent({
      orgId,
      attemptId: fixture.attemptId,
      actorUserId: adminUserId,
      reason: "Provider confirmed that no message was created."
    }, { now: () => attestedAt });
    expect(attested).toMatchObject({
      id: fixture.attemptId,
      applicationStatus: MessageApplicationStatus.AMBIGUOUS,
      attemptStatus: MessageAttemptStatus.RESOLVED_NOT_SENT,
      canRetry: true,
      requiresReview: false
    });

    const successorId = randomUUID();
    const successorCorrelationId = randomUUID();
    const competingSuccessorId = randomUUID();
    const competingCorrelationId = randomUUID();
    const retriedAt = new Date(clock.getTime() + 300);
    const retryInput = { orgId, attemptId: fixture.attemptId, actorUserId: adminUserId };
    const retryResults = await Promise.allSettled([
      retryAttestedDeliveryAttempt(retryInput, {
        now: () => retriedAt,
        randomId: (() => {
          const ids = [successorId, successorCorrelationId];
          return () => ids.shift() ?? "";
        })()
      }),
      retryAttestedDeliveryAttempt(retryInput, {
        now: () => retriedAt,
        randomId: (() => {
          const ids = [competingSuccessorId, competingCorrelationId];
          return () => ids.shift() ?? "";
        })()
      })
    ]);
    const fulfilled = retryResults.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof retryAttestedDeliveryAttempt>>> =>
        result.status === "fulfilled"
    );
    const rejected = retryResults.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({ code: "DELIVERY_ATTEMPT_CONFLICT" })
    });
    const successor = fulfilled[0]!.value;
    const winningSuccessorId = successor.id;
    const winningCorrelationId =
      winningSuccessorId === successorId ? successorCorrelationId : competingCorrelationId;
    expect(successor).toMatchObject({
      messageId: fixture.messageId,
      attemptNumber: 2,
      applicationStatus: MessageApplicationStatus.SCHEDULED,
      attemptStatus: MessageAttemptStatus.QUEUED,
      canRetry: false,
      requiresReview: false
    });
    const reviewed = await withTenantTransaction({ orgId }, async (tx) => ({
      predecessor: await tx.messageAttempt.findUniqueOrThrow({
        where: { id: fixture.attemptId }
      }),
      successor: await tx.messageAttempt.findUniqueOrThrow({ where: { id: winningSuccessorId } }),
      message: await tx.message.findUniqueOrThrow({ where: { id: fixture.messageId } }),
      audit: await tx.integrationAuditEvent.findMany({
        where: { orgId, subjectType: "message_attempt", subjectId: fixture.attemptId },
        orderBy: { createdAt: "asc" }
      })
    }));
    expect(reviewed.predecessor).toMatchObject({
      status: MessageAttemptStatus.RESOLVED_NOT_SENT,
      disposition: "not_sent",
      reconciledAt: attestedAt,
      reconciledByUserId: adminUserId
    });
    expect(reviewed.successor).toMatchObject({
      id: winningSuccessorId,
      retryOfAttemptId: fixture.attemptId,
      callbackCorrelationId: winningCorrelationId,
      status: MessageAttemptStatus.QUEUED,
      dueAt: retriedAt
    });
    expect(reviewed.message).toMatchObject({
      applicationStatus: MessageApplicationStatus.SCHEDULED,
      attemptCount: 2,
      scheduledAt: retriedAt
    });
    expect(reviewed.audit.map((event) => event.action)).toEqual([
      "MESSAGE_ATTEMPT_ATTESTED_NOT_SENT",
      "MESSAGE_ATTEMPT_RETRY_CREATED"
    ]);
  });
});

async function processingAttempt(
  label: string,
  transport: MessageTransport,
  processingExpiresAt: Date
) {
  const acceptedAt = new Date();
  const processingToken = randomUUID();
  const requestFingerprint = `m5-worker-${label}-${suffix}`;
  return withTenantTransaction({ orgId }, async (tx) => {
    const message = await tx.message.create({
      data: {
        orgId,
        contactId,
        direction: "OUTBOUND",
        body: `M5 worker ${label}`,
        applicationStatus: MessageApplicationStatus.ACCEPTED,
        transport,
        destination,
        requestFingerprint,
        acceptedAt,
        attemptCount: 1,
        idempotencyKey: `m5-worker:${label}:${suffix}`,
        createdAt: acceptedAt
      }
    });
    const attempt = await tx.messageAttempt.create({
      data: {
        orgId,
        messageId: message.id,
        attemptNumber: 1,
        transport,
        dueAt: acceptedAt,
        providerAccountId: transport === MessageTransport.TWILIO ? accountId : null,
        providerPhoneNumberId: transport === MessageTransport.TWILIO ? senderId : null,
        destination,
        body: message.body,
        requestFingerprint,
        callbackCorrelationId: randomUUID(),
        createdAt: acceptedAt
      }
    });
    await tx.messageAttempt.update({
      where: { id: attempt.id },
      data: {
        status: MessageAttemptStatus.PROCESSING,
        processingToken,
        processingExpiresAt,
        claimedAt: acceptedAt
      }
    });
    await tx.message.update({
      where: { id: message.id },
      data: { applicationStatus: MessageApplicationStatus.PROCESSING }
    });
    return {
      attemptId: attempt.id,
      messageId: message.id,
      requestFingerprint,
      claim: {
        attemptId: attempt.id,
        expectedOrgId: orgId,
        processingToken,
        processingExpiresAt
      }
    };
  });
}

function nextAllowedEasternTime(): Date {
  let candidate = new Date(Date.now() + 3_600_000);
  candidate.setUTCMinutes(0, 0, 0);
  while (isWithinQuietHours(candidate, "America/New_York")) {
    candidate = new Date(candidate.getTime() + 3_600_000);
  }
  return candidate;
}

function transactionAt(now: Date) {
  return async <T>(
    context: Readonly<{ orgId: string }>,
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> => withTenantTransaction(context, async (tx) => {
    const clocked = new Proxy(tx, {
      get(target, property) {
        if (property === "$queryRaw") {
          return (query: TemplateStringsArray, ...values: unknown[]) => {
            if (Array.from(query).join(" ").includes("SELECT clock_timestamp() AS now")) {
              return Promise.resolve([{ now }]);
            }
            const queryRaw = target.$queryRaw as unknown as (
              query: TemplateStringsArray,
              ...values: unknown[]
            ) => Promise<unknown>;
            return queryRaw.call(target, query, ...values);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as Prisma.TransactionClient;
    return operation(clocked);
  });
}
