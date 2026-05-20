import { prisma } from "@/lib/db/prisma";

export async function getOrganizationSummary(orgId: string) {
  return prisma.organization.findUnique({
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
  });
}

