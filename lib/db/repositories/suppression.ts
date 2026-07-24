import { Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";

export type AddSuppressionInput = {
  orgId?: string | null;
  phone: string;
  reason: string;
  source: string;
  metadata?: Prisma.InputJsonValue | null;
};

export function normalizePhone(phone: string): string {
  const sanitized = phone.replace(/[^\d+]/g, "");
  if (sanitized.startsWith("+")) {
    return sanitized;
  }
  if (sanitized.length === 10) {
    return `+1${sanitized}`;
  }
  if (sanitized.length === 11 && sanitized.startsWith("1")) {
    return `+${sanitized}`;
  }
  return sanitized;
}

export async function addSuppressionEntry(input: AddSuppressionInput, existingTx?: Prisma.TransactionClient) {
  const phone = normalizePhone(input.phone);
  const data: Prisma.SuppressionEntryUncheckedCreateInput = {
    orgId: input.orgId ?? null,
    phone,
    reason: input.reason,
    source: input.source,
    metadata: input.metadata ?? Prisma.DbNull
  };

  const orgId = input.orgId ?? "global";

  const execute = (tx: Prisma.TransactionClient) =>
    tx.suppressionEntry.upsert({
      where: { orgId_phone: { orgId: input.orgId ?? (null as unknown as string), phone } },
      update: { reason: input.reason, source: input.source, metadata: input.metadata ?? Prisma.DbNull },
      create: data
    });

  if (existingTx) {
    return execute(existingTx);
  }

  return withTenantTransaction({ orgId }, execute);
}

export async function removeSuppressionEntry(phone: string, orgId?: string | null) {
  const normalized = normalizePhone(phone);
  const targetOrgId = orgId ?? "global";

  return withTenantTransaction({ orgId: targetOrgId }, (tx) =>
    tx.suppressionEntry.deleteMany({
      where: { orgId: orgId ?? null, phone: normalized }
    })
  );
}

export async function isPhoneSuppressed(phone: string, orgId?: string | null): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const targetOrgId = orgId ?? "global";

  return withTenantTransaction({ orgId: targetOrgId }, async (tx) => {
    const count = await tx.suppressionEntry.count({
      where: {
        phone: normalized,
        ...(orgId ? { OR: [{ orgId }, { orgId: null }] } : { orgId: null })
      }
    });
    return count > 0;
  });
}

export async function getSuppressionReason(phone: string, orgId?: string | null): Promise<string | null> {
  const normalized = normalizePhone(phone);
  const targetOrgId = orgId ?? "global";

  return withTenantTransaction({ orgId: targetOrgId }, async (tx) => {
    const entry = await tx.suppressionEntry.findFirst({
      where: {
        phone: normalized,
        ...(orgId ? { OR: [{ orgId }, { orgId: null }] } : { orgId: null })
      },
      orderBy: { createdAt: "desc" }
    });
    return entry?.reason ?? null;
  });
}

export async function listSuppressionEntries(options: { orgId?: string | null; limit?: number; offset?: number } = {}) {
  const take = Math.min(options.limit ?? 50, 250);
  const skip = options.offset ?? 0;
  const targetOrgId = options.orgId ?? "global";

  return withTenantTransaction({ orgId: targetOrgId }, (tx) =>
    tx.suppressionEntry.findMany({
      where: options.orgId ? { OR: [{ orgId: options.orgId }, { orgId: null }] } : { orgId: null },
      orderBy: { createdAt: "desc" },
      take,
      skip
    })
  );
}
