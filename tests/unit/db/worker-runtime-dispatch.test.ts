import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { inspectRuntimeDatabasePostureForClient } from "@/lib/db/runtime-posture";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
const loginRole = `signalstack_test_worker_${suffix}`;
const loginPassword = `worker-runtime-${suffix}-A9`;

describe.runIf(run)("worker runtime dispatch capability", () => {
  let client: PrismaClient | undefined;
  let orgId = "";
  let queueJobId = "";
  let customerWebhookDeliveryId = "";

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      CREATE ROLE "${loginRole}"
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD '${loginPassword}'
    `);
    await prisma.$executeRawUnsafe(
      `GRANT signalstack_worker, signalstack_runtime TO "${loginRole}"`
    );
    client = new PrismaClient({ datasourceUrl: workerDatabaseUrl() });
    await client.$connect();

    const org = await prisma.organization.create({
      data: { slug: `worker-runtime-${suffix}`, name: "Worker Runtime", demoMode: true }
    });
    orgId = org.id;
    const scheduledAt = new Date(Date.now() - 60_000);
    const campaign = await prisma.campaign.create({
      data: {
        orgId,
        name: "Worker Runtime Campaign",
        status: "SCHEDULED",
        body: "Hello",
        scheduledAt
      }
    });
    const job = await prisma.queueJob.create({
      data: {
        orgId,
        campaignId: campaign.id,
        type: "SCHEDULED_CAMPAIGN",
        status: "QUEUED",
        idempotencyKey: `worker-runtime-${suffix}`,
        payload: { orgId, campaignId: campaign.id, scheduledAt: scheduledAt.toISOString() },
        runAt: scheduledAt
      }
    });
    queueJobId = job.id;

    const endpoint = await prisma.customerWebhookEndpoint.create({
      data: {
        orgId,
        name: "Worker Runtime Endpoint",
        canonicalUrl: `https://worker-${suffix}.example.test/events`
      }
    });
    const subscription = await prisma.customerWebhookSubscription.create({
      data: { orgId, endpointId: endpoint.id, eventTypes: ["contact.created"] }
    });
    const signingSecret = await prisma.customerWebhookSigningSecret.create({
      data: {
        orgId,
        subscriptionId: subscription.id,
        version: 1,
        ciphertext: `ciphertext-${suffix}`,
        iv: `iv-${suffix}`,
        authTag: `tag-${suffix}`,
        keyVersion: 1,
        fingerprint: `fingerprint-${suffix}`
      }
    });
    const event = await prisma.customerWebhookEvent.create({
      data: {
        orgId,
        deduplicationKey: `worker-runtime-${suffix}`,
        type: "contact.created",
        aggregateType: "contact",
        payloadText: "{}",
        payloadHash: `payload-${suffix}`,
        occurredAt: scheduledAt
      }
    });
    const delivery = await prisma.customerWebhookDelivery.create({
      data: {
        orgId,
        endpointId: endpoint.id,
        subscriptionId: subscription.id,
        eventId: event.id,
        signingSecretId: signingSecret.id,
        nextAttemptAt: scheduledAt
      }
    });
    customerWebhookDeliveryId = delivery.id;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    await client?.$disconnect();
    await prisma.$executeRawUnsafe(
      `REVOKE signalstack_worker, signalstack_runtime FROM "${loginRole}"`
    );
    await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${loginRole}"`);
  });

  it("claims only through the fixed function, then loads the row through tenant context", async () => {
    const runtime = requireClient(client);
    await expect(inspectRuntimeDatabasePostureForClient(runtime)).resolves.toBeUndefined();

    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRawUnsafe('SELECT count(*) FROM "QueueJob"');
      })
    ).rejects.toThrow();
    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRawUnsafe('SELECT count(*) FROM "CustomerWebhookDelivery"');
      })
    ).rejects.toThrow();

    const processingToken = randomUUID();
    const now = new Date();
    const claimed = await runtime.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
      return tx.$queryRaw<Array<{ id: string; orgId: string }>>`
        SELECT claim.id, claim."orgId"
        FROM public.claim_due_queue_jobs(1, ${now}::timestamptz, 300000, ${processingToken}::uuid) claim
      `;
    });
    expect(claimed).toEqual([{ id: queueJobId, orgId }]);

    const webhookToken = randomUUID();
    const claimedWebhooks = await runtime.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
      return tx.$queryRaw<Array<{ deliveryId: string; orgId: string }>>`
        SELECT claim."deliveryId", claim."orgId"
        FROM public.claim_due_customer_webhook_deliveries(
          1,
          300000,
          ${webhookToken}::uuid
        ) claim
      `;
    });
    expect(claimedWebhooks).toEqual([{ deliveryId: customerWebhookDeliveryId, orgId }]);

    const stored = await runtime.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
      return Promise.all([
        tx.queueJob.findUnique({ where: { id: queueJobId } }),
        tx.customerWebhookDelivery.findUnique({ where: { id: customerWebhookDeliveryId } })
      ]);
    });
    expect(stored[0]).toMatchObject({
      id: queueJobId,
      orgId,
      status: "PROCESSING",
      processingToken
    });
    expect(stored[1]).toMatchObject({
      id: customerWebhookDeliveryId,
      orgId,
      status: "PROCESSING",
      processingToken: webhookToken
    });

    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
        return tx.$queryRaw`
          SELECT * FROM public.claim_due_customer_webhook_deliveries(
            1,
            300000,
            ${randomUUID()}::uuid
          )
        `;
      })
    ).rejects.toThrow();
  });

  it("preserves a live disabled-endpoint lease, then reconciles it after expiry", async () => {
    const runtime = requireClient(client);
    const startedAt = new Date();
    const requestTimestamp = new Date(Math.floor(startedAt.getTime() / 1_000) * 1_000);
    const attempt = await prisma.customerWebhookDeliveryAttempt.create({
      data: {
        orgId,
        deliveryId: customerWebhookDeliveryId,
        generation: 1,
        attemptNumber: 1,
        requestTimestamp,
        outcome: null,
        startedAt,
        finishedAt: null
      }
    });
    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
        await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
        return tx.customerWebhookDeliveryAttempt.update({
          where: { id: attempt.id },
          data: { startedAt: new Date(startedAt.getTime() + 1) }
        });
      })
    ).rejects.toThrow();

    await prisma.customerWebhookEndpoint.updateMany({
      where: { orgId },
      data: { status: "DISABLED", disabledAt: new Date() }
    });

    const whileLive = await runtime.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
      return tx.$queryRaw<Array<{ deliveryId: string; orgId: string }>>`
        SELECT claim."deliveryId", claim."orgId"
        FROM public.claim_due_customer_webhook_deliveries(1, 300000, ${randomUUID()}::uuid) claim
      `;
    });
    expect(whileLive).toEqual([]);
    await expect(
      prisma.customerWebhookDelivery.findUniqueOrThrow({ where: { id: customerWebhookDeliveryId } })
    ).resolves.toMatchObject({ status: "PROCESSING", processingToken: expect.any(String) });
    await expect(
      prisma.customerWebhookDeliveryAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    ).resolves.toMatchObject({ outcome: null, finishedAt: null });

    await prisma.customerWebhookDelivery.update({
      where: { id: customerWebhookDeliveryId },
      data: { processingExpiresAt: new Date(Date.now() - 1_000) }
    });
    await runtime.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
      await tx.$queryRaw`
        SELECT * FROM public.claim_due_customer_webhook_deliveries(1, 300000, ${randomUUID()}::uuid)
      `;
    });
    await expect(
      prisma.customerWebhookDelivery.findUniqueOrThrow({ where: { id: customerWebhookDeliveryId } })
    ).resolves.toMatchObject({
      status: "CANCELED",
      attemptCount: 1,
      processingToken: null,
      processingExpiresAt: null,
      lastErrorCode: "ENDPOINT_DISABLED"
    });
    await expect(
      prisma.customerWebhookDeliveryAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    ).resolves.toMatchObject({
      outcome: "ambiguous",
      errorCode: "ENDPOINT_DISABLED_LEASE_EXPIRED",
      finishedAt: expect.any(Date)
    });
    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
        await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
        return tx.customerWebhookDeliveryAttempt.update({
          where: { id: attempt.id },
          data: { errorCode: "TAMPERED" }
        });
      })
    ).rejects.toThrow();
  });

  it("rejects null bounds and caller-selected dispatch time", async () => {
    const runtime = requireClient(client);
    const token = randomUUID();

    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRaw`
          SELECT * FROM public.claim_due_queue_jobs(
            NULL::integer,
            clock_timestamp(),
            300000,
            ${token}::uuid
          )
        `;
      })
    ).rejects.toThrow("Queue dispatch arguments are invalid");

    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRaw`
          SELECT * FROM public.claim_due_customer_webhook_deliveries(
            NULL::integer,
            300000,
            ${token}::uuid
          )
        `;
      })
    ).rejects.toThrow("Customer webhook dispatch arguments are invalid");

    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRaw`
          SELECT * FROM public.claim_due_queue_jobs(
            1,
            clock_timestamp() + INTERVAL '1 day',
            300000,
            ${token}::uuid
          )
        `;
      })
    ).rejects.toThrow("Queue dispatch arguments are invalid");
  });
});

function requireClient(value: PrismaClient | undefined): PrismaClient {
  if (!value) throw new Error("Worker runtime client was not initialized.");
  return value;
}

function workerDatabaseUrl(): string {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL is required for worker runtime integration tests.");
  const url = new URL(source);
  url.username = loginRole;
  url.password = loginPassword;
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}
