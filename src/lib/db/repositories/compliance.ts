import { A2pRegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ComplianceProfileUpdateInput } from "@/lib/validation/compliance";

export async function getOrCreateComplianceProfile(orgId: string) {
  return prisma.complianceProfile.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED
    }
  });
}

export async function updateComplianceProfile(orgId: string, input: ComplianceProfileUpdateInput) {
  return prisma.complianceProfile.upsert({
    where: { orgId },
    update: input,
    create: {
      orgId,
      ...input
    }
  });
}
