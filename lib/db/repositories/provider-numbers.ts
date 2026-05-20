import { ProviderPhoneNumberStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ProviderPhoneNumberInput } from "@/lib/validation/provider";

export async function listProviderPhoneNumbers(orgId: string) {
  return prisma.providerPhoneNumber.findMany({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
  });
}

export async function upsertProviderPhoneNumber(orgId: string, input: ProviderPhoneNumberInput) {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.providerPhoneNumber.updateMany({
        where: { orgId, isDefault: true },
        data: { isDefault: false }
      });
    }

    return tx.providerPhoneNumber.upsert({
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
  });
}
