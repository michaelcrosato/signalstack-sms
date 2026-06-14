import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ReadinessAuditQuery } from "@/lib/validation/readiness-audit";

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

export async function listLiveReadinessAuditEvents(orgId: string, take = 50, filters: Pick<ReadinessAuditQuery, "action" | "subjectType"> = {}) {
  return prisma.liveReadinessAuditEvent.findMany({
    where: {
      orgId,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.subjectType ? { subjectType: filters.subjectType } : {})
    },
    orderBy: { createdAt: "desc" },
    take
  });
}
