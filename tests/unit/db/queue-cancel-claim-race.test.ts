import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  CampaignStatus,
  ConsentStatus,
  PrismaClient,
  QueueJobStatus,
  QueueJobType
} from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { cancelCampaign } from "@/lib/db/repositories/campaigns";

describe.runIf(process.env.RUN_DB_TESTS === "true")("queue cancellation and worker claim database race", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const slug = `queue-cancel-race-${suffix}`;
  let orgId: string | undefined;
  const lockClient = new PrismaClient();
  const claimClient = new PrismaClient();

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } });
    }
    await Promise.all([lockClient.$disconnect(), claimClient.$disconnect()]);
  });

  it("lets a cancellation that locks queued work defeat a concurrent processing claim", async () => {
    const scheduledAt = new Date(Date.now() - 1_000);
    const org = await prisma.organization.create({
      data: { name: "Queue Cancel Race", slug }
    });
    orgId = org.id;
    const contact = await prisma.contact.create({
      data: {
        orgId,
        phone: `+1555${suffix.slice(0, 7)}`,
        consentStatus: ConsentStatus.OPTED_IN
      }
    });
    const campaign = await prisma.campaign.create({
      data: {
        orgId,
        name: "Cancellation race",
        body: "Hello {{firstName}}",
        status: CampaignStatus.SCHEDULED,
        scheduledAt,
        recipients: {
          create: { contactId: contact.id }
        }
      }
    });
    const queueJob = await prisma.queueJob.create({
      data: {
        orgId,
        campaignId: campaign.id,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED,
        idempotencyKey: `queue-cancel-race:${suffix}`,
        payload: {
          version: 1,
          orgId,
          campaignId: campaign.id,
          scheduledAt: scheduledAt.toISOString()
        },
        runAt: scheduledAt
      }
    });

    let cancelPromise: ReturnType<typeof cancelCampaign> | undefined;
    let claimPromise: ReturnType<typeof claimClient.queueJob.updateMany> | undefined;

    await lockClient.$transaction(async (tx) => {
      const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid()::integer AS pid
      `;
      await tx.$queryRaw`
        SELECT "id" FROM "Campaign" WHERE "id" = ${campaign.id} FOR UPDATE
      `;

      cancelPromise = cancelCampaign(orgId!, campaign.id);

      // The cancellation has already cancelled and locked the QueueJob when it
      // blocks on this transaction's Campaign row. Starting the competing
      // worker-shaped claim now forces it to wait behind that QueueJob lock.
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const [row] = await tx.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity AS activity
            WHERE ${connection.pid} = ANY(pg_blocking_pids(activity.pid))
          ) AS blocked
        `;
        if (row?.blocked) {
          break;
        }
        if (attempt === 199) {
          throw new Error("Timed out waiting for cancellation to reach the guarded campaign pause.");
        }
        await sleep(10);
      }

      const claimNow = new Date();
      claimPromise = claimClient.queueJob.updateMany({
        where: {
          id: queueJob.id,
          orgId,
          type: QueueJobType.SCHEDULED_CAMPAIGN,
          runAt: { lte: claimNow },
          status: QueueJobStatus.QUEUED
        },
        data: {
          status: QueueJobStatus.PROCESSING,
          processingToken: `concurrent-claim-${suffix}`,
          processingExpiresAt: new Date(claimNow.getTime() + 5 * 60 * 1_000)
        }
      });
      // Give the dedicated connection time to submit its exact worker-claim
      // update while cancellation still owns the durable row transition.
      await sleep(100);
    });

    if (!cancelPromise || !claimPromise) {
      throw new Error("Expected both concurrent operations to start.");
    }

    await expect(cancelPromise).resolves.toMatchObject({ status: CampaignStatus.PAUSED });
    await expect(claimPromise).resolves.toEqual({ count: 0 });

    await expect(prisma.queueJob.findUniqueOrThrow({ where: { id: queueJob.id } })).resolves.toMatchObject({
      status: QueueJobStatus.CANCELLED,
      processingToken: null,
      processingExpiresAt: null
    });
    await expect(prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).resolves.toMatchObject({
      status: CampaignStatus.PAUSED
    });
    await expect(prisma.message.count({ where: { orgId, campaignId: campaign.id } })).resolves.toBe(0);
  });

  it("rejects and rolls back cancellation when a processing claim wins first", async () => {
    if (!orgId) {
      throw new Error("Expected the queue-race organization fixture.");
    }

    const scheduledAt = new Date(Date.now() - 1_000);
    const contact = await prisma.contact.create({
      data: {
        orgId,
        phone: `+1666${suffix.slice(7, 14)}`,
        consentStatus: ConsentStatus.OPTED_IN
      }
    });
    const campaign = await prisma.campaign.create({
      data: {
        orgId,
        name: "Worker claim wins",
        body: "Hello {{firstName}}",
        status: CampaignStatus.SCHEDULED,
        scheduledAt,
        recipients: {
          create: { contactId: contact.id }
        }
      }
    });
    const queueJob = await prisma.queueJob.create({
      data: {
        orgId,
        campaignId: campaign.id,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        status: QueueJobStatus.QUEUED,
        idempotencyKey: `queue-claim-wins:${suffix}`,
        payload: {
          version: 1,
          orgId,
          campaignId: campaign.id,
          scheduledAt: scheduledAt.toISOString()
        },
        runAt: scheduledAt
      }
    });
    const processingToken = `claim-winner-${suffix}`;
    const processingExpiresAt = new Date(Date.now() + 5 * 60 * 1_000);
    let cancelPromise: ReturnType<typeof cancelCampaign> | undefined;

    await claimClient.$transaction(async (tx) => {
      const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid()::integer AS pid
      `;
      const claimed = await tx.queueJob.updateMany({
        where: {
          id: queueJob.id,
          orgId,
          type: QueueJobType.SCHEDULED_CAMPAIGN,
          status: QueueJobStatus.QUEUED,
          runAt: { lte: new Date() }
        },
        data: {
          status: QueueJobStatus.PROCESSING,
          processingToken,
          processingExpiresAt
        }
      });
      expect(claimed.count).toBe(1);

      cancelPromise = cancelCampaign(orgId!, campaign.id);
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const [row] = await tx.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity AS activity
            WHERE ${connection.pid} = ANY(pg_blocking_pids(activity.pid))
          ) AS blocked
        `;
        if (row?.blocked) {
          break;
        }
        if (attempt === 199) {
          throw new Error("Timed out waiting for cancellation to contend with the processing claim.");
        }
        await sleep(10);
      }
    });

    if (!cancelPromise) {
      throw new Error("Expected cancellation to start while the processing claim was held.");
    }

    await expect(cancelPromise).rejects.toThrow("A processing campaign cannot be canceled.");
    await expect(prisma.queueJob.findUniqueOrThrow({ where: { id: queueJob.id } })).resolves.toMatchObject({
      status: QueueJobStatus.PROCESSING,
      processingToken,
      processingExpiresAt
    });
    await expect(prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).resolves.toMatchObject({
      status: CampaignStatus.SCHEDULED,
      scheduledAt
    });
    await expect(prisma.message.count({ where: { orgId, campaignId: campaign.id } })).resolves.toBe(0);
  });
});
