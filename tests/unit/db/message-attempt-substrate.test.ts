import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus
} from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { withTenantTransaction } from "@/lib/db/tenant-context";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "");
const orgSlug = `m5-attempt-${suffix}`;
let orgId: string | undefined;

describe.runIf(run)("M5 message-attempt database substrate", () => {
  afterAll(async () => {
    if (orgId) {
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  it("reclaims only pre-frontier leases and durably recovers post-frontier ambiguity", async () => {
    const now = new Date();
    const accountSid = `AC${suffix.slice(0, 32)}`;
    const phoneSid = `PN${suffix.slice(0, 32)}`;
    const org = await prisma.organization.create({
      data: { name: "M5 attempt substrate", slug: orgSlug, demoMode: false }
    });
    orgId = org.id;
    const contact = await prisma.contact.create({
      data: { orgId: org.id, phone: "+15555550123" }
    });
    const account = await prisma.providerAccount.create({
      data: {
        orgId: org.id,
        provider: "twilio",
        externalAccountId: accountSid,
        externalAccountIdHash: `pvlookup_v1_${"a".repeat(43)}`,
        externalAccountIdLast4: accountSid.slice(-4),
        status: ProviderAccountStatus.VERIFIED,
        verifiedAt: now,
        lastCheckedAt: now
      }
    });
    const credential = await prisma.providerCredentialSecret.create({
      data: {
        orgId: org.id,
        providerAccountId: account.id,
        version: 1,
        keyVersion: 1,
        iv: "fixture-iv",
        ciphertext: "fixture-ciphertext",
        authTag: "fixture-auth-tag",
        fingerprint: `pvfp_${"b".repeat(22)}`
      }
    });
    const sender = await prisma.providerPhoneNumber.create({
      data: {
        orgId: org.id,
        phoneNumber: "+15555550999",
        phoneNumberHash: `pvlookup_v1_${"c".repeat(43)}`,
        provider: "twilio",
        providerAccountId: account.id,
        externalNumberId: phoneSid,
        externalNumberIdLast4: phoneSid.slice(-4),
        status: ProviderPhoneNumberStatus.VERIFIED,
        capabilities: ["sms"],
        verifiedAt: now,
        lastCheckedAt: now
      }
    });

    const [preFrontier, postFrontier] = await Promise.all(
      ["pre", "post"].map(async (label) => {
        const acceptedAt = new Date();
        return withTenantTransaction({ orgId: org.id }, async (tx) => {
          const message = await tx.message.create({
            data: {
              orgId: org.id,
              contactId: contact.id,
              direction: "OUTBOUND",
              body: `${label} frontier fixture`,
              applicationStatus: MessageApplicationStatus.ACCEPTED,
              transport: MessageTransport.TWILIO,
              destination: contact.phone,
              requestFingerprint: `m5-fingerprint-${label}-${suffix}`,
              acceptedAt,
              attemptCount: 1,
              idempotencyKey: `m5-attempt:${label}:${suffix}`,
              createdAt: acceptedAt
            }
          });
          const attempt = await tx.messageAttempt.create({
            data: {
              orgId: org.id,
              messageId: message.id,
              attemptNumber: 1,
              transport: MessageTransport.TWILIO,
              dueAt: acceptedAt,
              providerAccountId: account.id,
              providerPhoneNumberId: sender.id,
              destination: contact.phone,
              body: message.body,
              requestFingerprint: message.requestFingerprint!,
              callbackCorrelationId: randomUUID(),
              createdAt: acceptedAt
            }
          });
          return { message, attempt };
        });
      })
    );

    const initialToken = randomUUID();
    const initialClaims = await claimAttempts(10, 1_000, initialToken);
    expect(initialClaims.map((claim) => claim.attemptId).sort()).toEqual(
      [preFrontier.attempt.id, postFrontier.attempt.id].sort()
    );

    await withTenantTransaction({ orgId: org.id }, async (tx) => {
      const frontier = await tx.messageAttempt.updateMany({
        where: {
          id: postFrontier.attempt.id,
          orgId: org.id,
          status: MessageAttemptStatus.PROCESSING,
          processingToken: initialToken
        },
        data: {
          providerCredentialSecretId: credential.id,
          providerCredentialVersion: credential.version,
          providerCallStartedAt: new Date()
        }
      });
      expect(frontier.count).toBe(1);
    });

    await sleep(1_100);

    const competing = await Promise.all([
      claimAttempts(10, 1_000, randomUUID()),
      claimAttempts(10, 1_000, randomUUID())
    ]);
    expect(competing.flat().map((claim) => claim.attemptId)).toEqual([
      preFrontier.attempt.id
    ]);

    const recovered = await recoverAttempts(10);
    expect(recovered).toEqual([{ attemptId: postFrontier.attempt.id, orgId: org.id }]);
    await expect(recoverAttempts(10)).resolves.toEqual([]);

    const evidence = await withTenantTransaction({ orgId: org.id }, async (tx) => ({
      attempt: await tx.messageAttempt.findUniqueOrThrow({
        where: { id: postFrontier.attempt.id }
      }),
      message: await tx.message.findUniqueOrThrow({
        where: { id: postFrontier.message.id }
      })
    }));
    expect(evidence.attempt).toMatchObject({
      status: MessageAttemptStatus.AMBIGUOUS,
      processingToken: null,
      processingExpiresAt: null,
      errorCode: "WORKER_LEASE_EXPIRED_AFTER_FRONTIER",
      disposition: "ambiguous"
    });
    expect(evidence.attempt.completedAt).toBeInstanceOf(Date);
    expect(evidence.message).toMatchObject({
      applicationStatus: MessageApplicationStatus.AMBIGUOUS
    });
    expect(evidence.message.ambiguousAt).toBeInstanceOf(Date);
  });
});

async function claimAttempts(maxAttempts: number, leaseMs: number, token: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
    return tx.$queryRaw<Array<{ attemptId: string; orgId: string }>>`
      SELECT claim."attemptId", claim."orgId"
      FROM public.claim_due_message_attempts(
        ${maxAttempts}::integer,
        ${leaseMs}::integer,
        ${token}::uuid
      ) claim
    `;
  });
}

async function recoverAttempts(maxAttempts: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
    return tx.$queryRaw<Array<{ attemptId: string; orgId: string }>>`
      SELECT recovery."attemptId", recovery."orgId"
      FROM public.recover_expired_message_attempts(${maxAttempts}::integer) recovery
    `;
  });
}
