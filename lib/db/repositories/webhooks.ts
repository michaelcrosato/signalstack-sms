import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function recordWebhookEvent(input: {
  orgId: string;
  provider: string;
  eventType: string;
  idempotencyKey: string;
  rawPayload: Record<string, string>;
}) {
  const existing = await prisma.webhookEvent.findUnique({
    where: { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey: input.idempotencyKey } }
  });
  if (existing) {
    return { event: existing, duplicate: true };
  }

  const event = await prisma.webhookEvent.create({
    data: {
      orgId: input.orgId,
      provider: input.provider,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      rawPayload: input.rawPayload as Prisma.InputJsonObject,
      processedAt: new Date()
    }
  });

  return { event, duplicate: false };
}
