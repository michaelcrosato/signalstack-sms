import { A2pRegistrationStatus } from "@prisma/client";
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
  return withTenantTransaction({ orgId }, (tx) => tx.complianceProfile.upsert({
    where: { orgId },
    update: input,
    create: {
      orgId,
      ...input
    }
  }));
}
