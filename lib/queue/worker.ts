import { CampaignStatus, QueueJobStatus, QueueJobType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { dummyProvider } from "@/lib/messaging/provider/dummy-provider";
import { renderTemplate } from "@/lib/messaging/render-template";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";

export type WorkerSafetyInput = {
  liveMessagingEnabled?: string;
  messagingProvider?: string;
};

export function localWorkerProviderIsAllowed(input: WorkerSafetyInput) {
  return input.liveMessagingEnabled !== "true" && (input.messagingProvider ?? "dummy") === "dummy";
}

export function campaignMessageValues(contact: {
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
}) {
  return {
    phone: contact.phone,
    email: contact.email ?? "",
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    displayName: contact.displayName ?? contact.firstName ?? contact.phone
  };
}

export async function processDueScheduledCampaignJobs(now = new Date()) {
  if (
    !localWorkerProviderIsAllowed({
      liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED,
      messagingProvider: process.env.MESSAGING_PROVIDER
    })
  ) {
    return {
      processed: 0,
      skipped: 0,
      blocked: true
    };
  }

  const jobs = await prisma.queueJob.findMany({
    where: {
      type: QueueJobType.SCHEDULED_CAMPAIGN,
      status: QueueJobStatus.QUEUED,
      runAt: { lte: now }
    },
    orderBy: { runAt: "asc" },
    take: 25
  });

  let processed = 0;
  let skipped = 0;

  for (const job of jobs) {
    const payload = scheduledCampaignJobSchema.safeParse(job.payload);
    if (!payload.success || payload.data.orgId !== job.orgId || payload.data.campaignId !== job.campaignId) {
      await prisma.queueJob.update({ where: { id: job.id }, data: { status: QueueJobStatus.FAILED } });
      skipped += 1;
      continue;
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: payload.data.campaignId, orgId: job.orgId },
      include: { recipients: { include: { contact: true } } }
    });
    if (!campaign || campaign.status !== CampaignStatus.SCHEDULED) {
      await prisma.queueJob.update({ where: { id: job.id }, data: { status: QueueJobStatus.FAILED } });
      skipped += 1;
      continue;
    }

    for (const recipient of campaign.recipients) {
      const idempotencyKey = `dummy-outbound:${job.id}:${recipient.contactId}`;
      const body = renderTemplate(campaign.body, campaignMessageValues(recipient.contact));
      const result = await dummyProvider.send({
        to: recipient.contact.phone,
        from: "demo-signalstack",
        body,
        orgId: job.orgId,
        idempotencyKey
      });

      await prisma.message.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          orgId: job.orgId,
          contactId: recipient.contactId,
          campaignId: campaign.id,
          direction: "OUTBOUND",
          body,
          providerMessageId: result.providerMessageId,
          idempotencyKey
        }
      });
    }

    await prisma.queueJob.update({ where: { id: job.id }, data: { status: QueueJobStatus.COMPLETED } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.COMPLETED } });
    processed += 1;
  }

  return {
    processed,
    skipped,
    blocked: false
  };
}
