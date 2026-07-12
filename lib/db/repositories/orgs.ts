import { withTenantTransaction } from "@/lib/db/tenant-context";

export async function getOrganizationSummary(orgId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      demoMode: true,
      timezone: true,
      _count: {
        select: {
          memberships: true,
          contacts: true,
          campaigns: true,
          conversations: true,
          messages: true
        }
      }
    }
  }));
}

