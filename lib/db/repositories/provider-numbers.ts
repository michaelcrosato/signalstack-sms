import { ProviderPhoneNumberStatus } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import type { ProviderPhoneNumberInput } from "@/lib/validation/provider";
import type { ReadinessAuditInput } from "@/lib/db/repositories/readiness-audit";

export async function listProviderPhoneNumbers(orgId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.providerPhoneNumber.findMany({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
  }));
}

export async function upsertProviderPhoneNumber(
  orgId: string,
  input: ProviderPhoneNumberInput,
  audit?: Pick<ReadinessAuditInput, "actorUserId">
) {
  return withTenantTransaction({ orgId, userId: audit?.actorUserId }, async (tx) => {
    if (input.isDefault) {
      await tx.providerPhoneNumber.updateMany({
        where: { orgId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const number = await tx.providerPhoneNumber.upsert({
      where: {
        orgId_phoneNumber: {
          orgId,
          phoneNumber: input.phoneNumber
        }
      },
      update: {
        label: input.label,
        provider: input.provider,
        capabilities: input.capabilities,
        isDefault: input.isDefault,
        status: input.provider === "dummy" ? ProviderPhoneNumberStatus.DEMO : ProviderPhoneNumberStatus.CONFIGURED
      },
      create: {
        orgId,
        phoneNumber: input.phoneNumber,
        label: input.label,
        provider: input.provider,
        capabilities: input.capabilities,
        isDefault: input.isDefault,
        status: input.provider === "dummy" ? ProviderPhoneNumberStatus.DEMO : ProviderPhoneNumberStatus.CONFIGURED
      }
    });

    await tx.liveReadinessAuditEvent.create({
      data: {
        orgId,
        actorUserId: audit?.actorUserId,
        action: "PROVIDER_NUMBER_UPSERTED",
        subjectType: "ProviderPhoneNumber",
        subjectId: number.id,
        metadata: {
          provider: number.provider,
          isDefault: number.isDefault,
          status: number.status
        }
      }
    });

    return number;
  });
}
