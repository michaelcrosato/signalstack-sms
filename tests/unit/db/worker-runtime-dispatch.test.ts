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

    const stored = await runtime.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
      return tx.queueJob.findUnique({ where: { id: queueJobId } });
    });
    expect(stored).toMatchObject({
      id: queueJobId,
      orgId,
      status: "PROCESSING",
      processingToken
    });
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
