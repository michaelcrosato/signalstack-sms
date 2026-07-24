import { ConsentStatus, Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";

export type CreateConsentEventInput = {
  contactId?: string | null;
  phone: string;
  consentStatus: ConsentStatus;
  previousStatus?: ConsentStatus | null;
  source: string;
  sourceIp?: string | null;
  channel?: string | null;
  actorUserId?: string | null;
  consentCapturedAt?: Date;
  consentMethod?: string | null;
  consentDisclosure?: string | null;
  evidenceReference?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type ListConsentEventsOptions = {
  phone?: string;
  contactId?: string;
  limit?: number;
  offset?: number;
};

export async function recordConsentEvent(
  orgId: string,
  input: CreateConsentEventInput,
  txClient?: Prisma.TransactionClient
) {
  const data: Prisma.ConsentEventUncheckedCreateInput = {
    orgId,
    contactId: input.contactId ?? null,
    phone: input.phone,
    consentStatus: input.consentStatus,
    previousStatus: input.previousStatus ?? null,
    source: input.source,
    sourceIp: input.sourceIp ?? null,
    channel: input.channel ?? null,
    actorUserId: input.actorUserId ?? null,
    consentCapturedAt: input.consentCapturedAt ?? new Date(),
    consentMethod: input.consentMethod ?? null,
    consentDisclosure: input.consentDisclosure ?? null,
    evidenceReference: input.evidenceReference ?? null,
    metadata: input.metadata ?? Prisma.DbNull
  };

  if (txClient) {
    return txClient.consentEvent.create({ data });
  }

  return withTenantTransaction({ orgId }, (tx) => tx.consentEvent.create({ data }));
}

export async function listConsentEvents(orgId: string, options: ListConsentEventsOptions = {}) {
  const take = Math.min(options.limit ?? 50, 250);
  const skip = options.offset ?? 0;

  const where: Prisma.ConsentEventWhereInput = {
    orgId,
    ...(options.phone ? { phone: options.phone } : {}),
    ...(options.contactId ? { contactId: options.contactId } : {})
  };

  return withTenantTransaction({ orgId }, (tx) =>
    tx.consentEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip
    })
  );
}

export async function getConsentEvent(orgId: string, id: string) {
  return withTenantTransaction({ orgId }, (tx) =>
    tx.consentEvent.findFirst({
      where: { orgId, id }
    })
  );
}
