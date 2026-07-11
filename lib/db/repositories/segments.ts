import { type Prisma, ConsentStatus } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";

export type SegmentFilter = {
  tagNames?: string[];
  consentStatuses?: ConsentStatus[];
  minLeadScore?: number;
  maxLeadScore?: number;
};

/**
 * Compiles dynamic segment filter parameters into a Prisma query and returns matching contacts.
 */
export async function evaluateSegmentContacts(
  orgId: string,
  filter: SegmentFilter,
  tx?: Prisma.TransactionClient
) {
  const whereClause: Prisma.ContactWhereInput = {
    orgId,
    archivedAt: null
  };

  if (filter.consentStatuses && filter.consentStatuses.length > 0) {
    whereClause.consentStatus = { in: filter.consentStatuses };
  }

  if (filter.minLeadScore !== undefined || filter.maxLeadScore !== undefined) {
    const scoreFilter: Prisma.IntNullableFilter = {};
    if (filter.minLeadScore !== undefined) {
      scoreFilter.gte = filter.minLeadScore;
    }
    if (filter.maxLeadScore !== undefined) {
      scoreFilter.lte = filter.maxLeadScore;
    }
    whereClause.leadScore = scoreFilter;
  }

  if (filter.tagNames && filter.tagNames.length > 0) {
    whereClause.tagLinks = {
      some: {
        tag: {
          name: { in: filter.tagNames }
        }
      }
    };
  }

  const execute = (client: Prisma.TransactionClient) => client.contact.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    include: {
      tagLinks: { include: { tag: true } },
      listLinks: { include: { list: true } }
    }
  });

  return tx ? execute(tx) : withTenantTransaction({ orgId }, execute);
}
