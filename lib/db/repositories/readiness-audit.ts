import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type ReadinessAuditInput = {
  actorUserId?: string;
  action: string;
  subjectType: string;
  subjectId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function recordLiveReadinessAuditEvent(orgId: string, input: ReadinessAuditInput) {
  return prisma.liveReadinessAuditEvent.create({
    data: {
      orgId,
      actorUserId: input.actorUserId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: input.metadata
    }
  });
}

export async function listLiveReadinessAuditEvents(orgId: string, take = 50) {
  return prisma.liveReadinessAuditEvent.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take
  });
}
