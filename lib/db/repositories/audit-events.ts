import { Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";

export type CreateAuditEventInput = {
  actorUserId?: string | null;
  apiCredentialId?: string | null;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  sourceIp?: string | null;
  channel?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type ListAuditEventsOptions = {
  action?: string;
  subjectType?: string;
  subjectId?: string;
  actorUserId?: string;
  limit?: number;
  offset?: number;
};

export async function recordAuditEvent(
  orgId: string,
  input: CreateAuditEventInput,
  txClient?: Prisma.TransactionClient
) {
  const data: Prisma.AuditEventUncheckedCreateInput = {
    orgId,
    actorUserId: input.actorUserId ?? null,
    apiCredentialId: input.apiCredentialId ?? null,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    sourceIp: input.sourceIp ?? null,
    channel: input.channel ?? null,
    metadata: input.metadata ?? Prisma.DbNull
  };

  if (txClient) {
    return txClient.auditEvent.create({ data });
  }

  return withTenantTransaction({ orgId }, (tx) => tx.auditEvent.create({ data }));
}

export async function listAuditEvents(orgId: string, options: ListAuditEventsOptions = {}) {
  const take = Math.min(options.limit ?? 50, 250);
  const skip = options.offset ?? 0;

  const where: Prisma.AuditEventWhereInput = {
    orgId,
    ...(options.action ? { action: options.action } : {}),
    ...(options.subjectType ? { subjectType: options.subjectType } : {}),
    ...(options.subjectId ? { subjectId: options.subjectId } : {}),
    ...(options.actorUserId ? { actorUserId: options.actorUserId } : {})
  };

  return withTenantTransaction({ orgId }, (tx) =>
    tx.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip
    })
  );
}

export async function getAuditEvent(orgId: string, id: string) {
  return withTenantTransaction({ orgId }, (tx) =>
    tx.auditEvent.findFirst({
      where: { orgId, id }
    })
  );
}
