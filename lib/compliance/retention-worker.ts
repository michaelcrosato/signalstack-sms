import type { Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";

export type RetentionPolicyConfig = {
  messageRetentionDays?: number;
  rawPayloadRetentionDays?: number;
  now?: Date;
  orgId?: string;
};

export type RetentionPruneResult = {
  messagesPurged: number;
  attemptsPurged: number;
  webhookPayloadsPurged: number;
  customerWebhookEventsPurged: number;
  executedAt: Date;
};

export const DEFAULT_MESSAGE_RETENTION_DAYS = 30;
export const DEFAULT_RAW_PAYLOAD_RETENTION_DAYS = 30;

export async function runRetentionPruneWorker(
  config: RetentionPolicyConfig = {}
): Promise<RetentionPruneResult> {
  const now = config.now ?? new Date();
  const msgDays = config.messageRetentionDays ?? Number(process.env.MESSAGE_RETENTION_DAYS ?? DEFAULT_MESSAGE_RETENTION_DAYS);
  const payloadDays = config.rawPayloadRetentionDays ?? Number(process.env.RAW_PAYLOAD_RETENTION_DAYS ?? DEFAULT_RAW_PAYLOAD_RETENTION_DAYS);

  const messageCutoff = new Date(now.getTime() - msgDays * 86400000);
  const payloadCutoff = new Date(now.getTime() - payloadDays * 86400000);

  const orgId = config.orgId;
  const contextOrgId = orgId ?? "global";

  return withTenantTransaction({ orgId: contextOrgId }, async (tx: Prisma.TransactionClient) => {
    // 1. Purge expired Message bodies & mediaUrls while preserving Message record and metadata
    const messageWhere: Prisma.MessageWhereInput = {
      createdAt: { lt: messageCutoff },
      body: { not: "[RETENTION_PURGED]" },
      ...(orgId ? { orgId } : {})
    };
    const messageResult = await tx.message.updateMany({
      where: messageWhere,
      data: {
        body: "[RETENTION_PURGED]",
        mediaUrls: []
      }
    });

    // 2. Purge expired MessageAttempt bodies & mediaUrls
    const attemptWhere: Prisma.MessageAttemptWhereInput = {
      createdAt: { lt: messageCutoff },
      body: { not: "[RETENTION_PURGED]" },
      ...(orgId ? { orgId } : {})
    };
    const attemptResult = await tx.messageAttempt.updateMany({
      where: attemptWhere,
      data: {
        body: "[RETENTION_PURGED]",
        mediaUrls: []
      }
    });

    // 3. Purge expired WebhookEvent rawPayloads
    const webhookWhere: Prisma.WebhookEventWhereInput = {
      receivedAt: { lt: payloadCutoff },
      ...(orgId ? { orgId } : {})
    };
    const webhookResult = await tx.webhookEvent.updateMany({
      where: webhookWhere,
      data: {
        rawPayload: { purged: true }
      }
    });

    // 4. Purge expired CustomerWebhookEvent payloadTexts
    const customerWebhookWhere: Prisma.CustomerWebhookEventWhereInput = {
      createdAt: { lt: payloadCutoff },
      payloadText: { not: "[RETENTION_PURGED]" },
      ...(orgId ? { orgId } : {})
    };
    const customerWebhookResult = await tx.customerWebhookEvent.updateMany({
      where: customerWebhookWhere,
      data: {
        payloadText: "[RETENTION_PURGED]"
      }
    });

    return {
      messagesPurged: messageResult.count,
      attemptsPurged: attemptResult.count,
      webhookPayloadsPurged: webhookResult.count,
      customerWebhookEventsPurged: customerWebhookResult.count,
      executedAt: now
    };
  });
}
