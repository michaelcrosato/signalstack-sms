import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

function isUniqueConstraintConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function recordWebhookEvent(input: {
  orgId: string;
  provider: string;
  eventType: string;
  idempotencyKey: string;
  rawPayload: Record<string, string>;
}) {
  const where = { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey: input.idempotencyKey } };
  const existing = await prisma.webhookEvent.findUnique({ where });
  if (existing) {
    return { event: existing, duplicate: true };
  }

  try {
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
  } catch (error) {
    if (!isUniqueConstraintConflict(error)) {
      throw error;
    }

    const duplicate = await prisma.webhookEvent.findUnique({ where });
    if (!duplicate) {
      throw error;
    }

    return { event: duplicate, duplicate: true };
  }
}
