import { randomUUID } from "node:crypto";
import { MembershipRole, Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { withTenantTransaction } from "@/lib/db/tenant-context";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "");

type Fixture = Readonly<{
  orgId: string;
  userId: string;
  credentialId: string;
  endpointId: string;
  subscriptionId: string;
  signingSecretId: string;
  eventId: string;
  deliveryId: string;
}>;

let a: Fixture;
let b: Fixture;

describe.runIf(run)("M3 public integration database substrate", () => {
  beforeAll(async () => {
    a = await createFixture("a");
    b = await createFixture("b");
  });

  afterAll(async () => {
    if (a && b) {
      await prisma.organization.deleteMany({ where: { id: { in: [a.orgId, b.orgId] } } });
      await prisma.appUser.deleteMany({ where: { id: { in: [a.userId, b.userId] } } });
    }
  });

  it("accepts a complete same-tenant credential, audit, event, and delivery chain", async () => {
    const idempotency = await prisma.apiIdempotencyRecord.create({
      data: {
        orgId: a.orgId,
        credentialId: a.credentialId,
        key: `accepted-${suffix}`,
        method: "POST",
        canonicalRoute: "/api/v1/contacts",
        requestHash: `request-${suffix}`,
        responseStatus: 201,
        responseBody: { data: { id: "contact" } },
        responseHeaders: { location: "/api/v1/contacts/contact" },
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const audit = await prisma.integrationAuditEvent.create({
      data: {
        orgId: a.orgId,
        actorUserId: a.userId,
        apiCredentialId: a.credentialId,
        action: "API_KEY_USED",
        subjectType: "api_credential",
        subjectId: a.credentialId
      }
    });
    const attempt = await prisma.customerWebhookDeliveryAttempt.create({
      data: {
        orgId: a.orgId,
        deliveryId: a.deliveryId,
        generation: 1,
        attemptNumber: 1,
        requestTimestamp: new Date(),
        outcome: "ACKNOWLEDGED",
        statusCode: 204,
        startedAt: new Date(),
        finishedAt: new Date()
      }
    });

    expect(idempotency.orgId).toBe(a.orgId);
    expect(audit.orgId).toBe(a.orgId);
    expect(attempt.deliveryId).toBe(a.deliveryId);

    const expiredCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    const expired = await prisma.apiIdempotencyRecord.create({
      data: {
        orgId: a.orgId,
        credentialId: a.credentialId,
        key: `expired-${suffix}`,
        method: "POST",
        canonicalRoute: "/api/v1/contacts",
        requestHash: `expired-request-${suffix}`,
        responseStatus: 201,
        responseBody: {},
        responseHeaders: {},
        createdAt: expiredCreatedAt,
        expiresAt: new Date(expiredCreatedAt.getTime() + 60 * 60 * 1_000)
      }
    });
    await withTenantTransaction(
      { orgId: a.orgId },
      (tx) => tx.apiIdempotencyRecord.delete({ where: { id: expired.id } }),
      { attest: false }
    );
    await expect(
      prisma.apiIdempotencyRecord.findUnique({ where: { id: expired.id } })
    ).resolves.toBeNull();
  });

  it("rejects every forged cross-tenant integration relation", async () => {
    const localProbeEvent = await prisma.customerWebhookEvent.create({
      data: {
        orgId: a.orgId,
        deduplicationKey: `foreign-secret-probe-${suffix}`,
        type: "contact.created",
        aggregateType: "contact",
        payloadText: "{}",
        payloadHash: `foreign-secret-probe-${suffix}`,
        occurredAt: new Date()
      }
    });
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ApiIdempotencyRecord"
          ("id", "orgId", "credentialId", "key", "method", "canonicalRoute", "requestHash",
           "responseStatus", "responseBody", "responseHeaders", "expiresAt", "updatedAt")
        VALUES
          (${rowId("foreign_idempotency")}, ${a.orgId}, ${b.credentialId}, ${rowId("key")},
           'POST', '/api/v1/contacts', ${rowId("request")}, 201, '{}'::jsonb, '{}'::jsonb,
           NOW() + INTERVAL '1 hour', NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CustomerWebhookSubscription"
          ("id", "orgId", "endpointId", "eventTypes", "updatedAt")
        VALUES
          (${rowId("foreign_subscription")}, ${a.orgId}, ${b.endpointId},
           ARRAY['contact.created']::text[], NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CustomerWebhookSigningSecret"
          ("id", "orgId", "subscriptionId", "version", "ciphertext", "iv", "authTag",
           "keyVersion", "fingerprint")
        VALUES
          (${rowId("foreign_secret")}, ${a.orgId}, ${b.subscriptionId}, 2, 'ciphertext', 'iv',
           'tag', 1, 'fingerprint')
      `),
      "23503"
    );
    await expectSqlState(
      forgedDelivery("foreign_delivery_event", {
        endpointId: a.endpointId,
        subscriptionId: a.subscriptionId,
        eventId: b.eventId,
        signingSecretId: a.signingSecretId
      }),
      "23503"
    );
    await expectSqlState(
      forgedDelivery("foreign_delivery_secret", {
        endpointId: a.endpointId,
        subscriptionId: a.subscriptionId,
        eventId: localProbeEvent.id,
        signingSecretId: b.signingSecretId
      }),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CustomerWebhookDeliveryAttempt"
          ("id", "orgId", "deliveryId", "generation", "attemptNumber", "requestTimestamp",
           "outcome", "startedAt", "finishedAt")
        VALUES
          (${rowId("foreign_attempt")}, ${a.orgId}, ${b.deliveryId}, 1, 1, NOW(),
           'TRANSPORT_ERROR', NOW(), NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "IntegrationAuditEvent"
          ("id", "orgId", "apiCredentialId", "action", "subjectType")
        VALUES
          (${rowId("foreign_audit")}, ${a.orgId}, ${b.credentialId}, 'FORGED', 'ApiCredential')
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "IntegrationAuditEvent"
          ("id", "orgId", "action", "subjectType", "subjectId")
        VALUES
          (${rowId("foreign_audit_subject")}, ${a.orgId}, 'FORGED', 'api_credential',
           ${b.credentialId})
      `),
      "23503"
    );
  });

  it("enforces active-secret uniqueness, immutable pins, and replay generation lineage", async () => {
    await expect(
      prisma.customerWebhookSigningSecret.create({
        data: {
          orgId: a.orgId,
          subscriptionId: a.subscriptionId,
          version: 2,
          ciphertext: "second-active",
          iv: "iv",
          authTag: "tag",
          keyVersion: 1,
          fingerprint: "second-active"
        }
      })
    ).rejects.toThrow();

    await prisma.customerWebhookSigningSecret.update({
      where: { id: a.signingSecretId },
      data: { retiredAt: new Date() }
    });
    await expect(
      prisma.customerWebhookSigningSecret.create({
        data: {
          orgId: a.orgId,
          subscriptionId: a.subscriptionId,
          version: 2,
          ciphertext: "rotated-ciphertext",
          iv: "rotated-iv",
          authTag: "rotated-tag",
          keyVersion: 1,
          fingerprint: "rotated-fingerprint"
        }
      })
    ).resolves.toMatchObject({ version: 2, retiredAt: null });

    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "CustomerWebhookEndpoint"
        SET "canonicalUrl" = 'https://forged.example.test/events'
        WHERE "id" = ${a.endpointId}
      `),
      "23514"
    );

    const otherEndpoint = await prisma.customerWebhookEndpoint.create({
      data: {
        orgId: a.orgId,
        name: "Other endpoint",
        canonicalUrl: `https://other-${suffix}.example.test/events`
      }
    });
    const otherSubscription = await prisma.customerWebhookSubscription.create({
      data: { orgId: a.orgId, endpointId: otherEndpoint.id, eventTypes: ["contact.created"] }
    });
    const otherSecret = await prisma.customerWebhookSigningSecret.create({
      data: {
        orgId: a.orgId,
        subscriptionId: otherSubscription.id,
        version: 1,
        ciphertext: "other-ciphertext",
        iv: "other-iv",
        authTag: "other-tag",
        keyVersion: 1,
        fingerprint: "other-fingerprint"
      }
    });
    const otherEvent = await prisma.customerWebhookEvent.create({
      data: {
        orgId: a.orgId,
        deduplicationKey: `other-${suffix}`,
        type: "contact.created",
        aggregateType: "contact",
        payloadText: "{}",
        payloadHash: `other-payload-${suffix}`,
        occurredAt: new Date()
      }
    });

    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CustomerWebhookDelivery"
          ("id", "orgId", "endpointId", "subscriptionId", "eventId", "signingSecretId",
           "generation", "replayOfDeliveryId", "updatedAt")
        VALUES
          (${rowId("forged_replay")}, ${a.orgId}, ${otherEndpoint.id}, ${otherSubscription.id},
           ${otherEvent.id}, ${otherSecret.id}, 2, ${a.deliveryId}, NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CustomerWebhookDeliveryAttempt"
          ("id", "orgId", "deliveryId", "generation", "attemptNumber", "requestTimestamp",
           "outcome", "startedAt", "finishedAt")
        VALUES
          (${rowId("wrong_generation_attempt")}, ${a.orgId}, ${a.deliveryId}, 2, 2, NOW(),
           'TRANSPORT_ERROR', NOW(), NOW())
      `),
      "23503"
    );
  });
});

async function createFixture(side: "a" | "b"): Promise<Fixture> {
  const org = await prisma.organization.create({
    data: { name: `Integration ${side}`, slug: `integration-${side}-${suffix}` }
  });
  const user = await prisma.appUser.create({
    data: {
      email: `integration-${side}-${suffix}@example.test`,
      normalizedEmail: `integration-${side}-${suffix}@example.test`
    }
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: MembershipRole.OWNER }
  });
  const credential = await prisma.apiCredential.create({
    data: {
      orgId: org.id,
      name: `Credential ${side}`,
      prefix: `${side}_${suffix}`,
      secretHash: `hash-${side}-${suffix}`,
      scopes: ["contacts:read", "webhooks:write"]
    }
  });
  const endpoint = await prisma.customerWebhookEndpoint.create({
    data: {
      orgId: org.id,
      name: `Endpoint ${side}`,
      canonicalUrl: `https://${side}-${suffix}.example.test/events`
    }
  });
  const subscription = await prisma.customerWebhookSubscription.create({
    data: { orgId: org.id, endpointId: endpoint.id, eventTypes: ["contact.created"] }
  });
  const signingSecret = await prisma.customerWebhookSigningSecret.create({
    data: {
      orgId: org.id,
      subscriptionId: subscription.id,
      version: 1,
      ciphertext: `ciphertext-${side}`,
      iv: `iv-${side}`,
      authTag: `tag-${side}`,
      keyVersion: 1,
      fingerprint: `fingerprint-${side}`
    }
  });
  const event = await prisma.customerWebhookEvent.create({
    data: {
      orgId: org.id,
      deduplicationKey: `contact-created-${side}-${suffix}`,
      type: "contact.created",
      aggregateType: "contact",
      payloadText: "{}",
      payloadHash: `payload-${side}-${suffix}`,
      occurredAt: new Date()
    }
  });
  const delivery = await prisma.customerWebhookDelivery.create({
    data: {
      orgId: org.id,
      endpointId: endpoint.id,
      subscriptionId: subscription.id,
      eventId: event.id,
      signingSecretId: signingSecret.id
    }
  });
  return {
    orgId: org.id,
    userId: user.id,
    credentialId: credential.id,
    endpointId: endpoint.id,
    subscriptionId: subscription.id,
    signingSecretId: signingSecret.id,
    eventId: event.id,
    deliveryId: delivery.id
  };
}

function forgedDelivery(
  label: string,
  input: Readonly<{
    endpointId: string;
    subscriptionId: string;
    eventId: string;
    signingSecretId: string;
  }>
): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerWebhookDelivery"
      ("id", "orgId", "endpointId", "subscriptionId", "eventId", "signingSecretId", "updatedAt")
    VALUES
      (${rowId(label)}, ${a.orgId}, ${input.endpointId}, ${input.subscriptionId}, ${input.eventId},
       ${input.signingSecretId}, NOW())
  `);
}

function rowId(label: string): string {
  return `${label}_${suffix}`;
}

async function expectSqlState(operation: Promise<unknown>, expected: string): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(readSqlState(error)).toBe(expected);
    return;
  }
  throw new Error(`Expected PostgreSQL SQLSTATE ${expected}, but the write succeeded.`);
}

function readSqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const meta = Reflect.get(error, "meta");
  if (typeof meta === "object" && meta !== null) {
    const nested = Reflect.get(meta, "code");
    if (typeof nested === "string") return nested;
  }
  const direct = Reflect.get(error, "code");
  return typeof direct === "string" ? direct : undefined;
}
