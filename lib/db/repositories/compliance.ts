import { A2pRegistrationStatus, type Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import type { ComplianceProfileUpdateInput } from "@/lib/validation/compliance";

export async function getComplianceProfile(orgId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.complianceProfile.findUnique({ where: { orgId } }));
}

export async function getOrCreateComplianceProfile(orgId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.complianceProfile.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED
    }
  }));
}

export async function updateComplianceProfile(orgId: string, input: ComplianceProfileUpdateInput) {
  const updateData: Prisma.ComplianceProfileUncheckedUpdateInput = {
    ...input,
    verificationDetails: (input.verificationDetails as Prisma.InputJsonValue) ?? undefined
  };
  const createData: Prisma.ComplianceProfileUncheckedCreateInput = {
    orgId,
    ...input,
    verificationDetails: (input.verificationDetails as Prisma.InputJsonValue) ?? undefined
  };

  return withTenantTransaction({ orgId }, (tx) => tx.complianceProfile.upsert({
    where: { orgId },
    update: updateData,
    create: createData
  }));
}
