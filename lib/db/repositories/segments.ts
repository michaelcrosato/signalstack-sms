import { type Prisma, ConsentStatus } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";

export type SegmentFilter = {
  tagNames?: string[];
  tagIds?: string[];
  listNames?: string[];
  listIds?: string[];
  consentStatuses?: ConsentStatus[];
  minLeadScore?: number;
  maxLeadScore?: number;
  segmentId?: string;
};

/**
 * Compiles dynamic segment filter parameters into a Prisma query and returns matching contacts.
 */
export async function evaluateSegmentContacts(
  orgId: string,
  filter: SegmentFilter,
  tx?: Prisma.TransactionClient
) {
  const execute = async (client: Prisma.TransactionClient) => {
    let effectiveFilter = { ...filter };

    if (filter.segmentId) {
      const segmentRow = await client.segment.findFirst({
        where: { orgId, id: filter.segmentId }
      });
      if (segmentRow && segmentRow.definition && typeof segmentRow.definition === "object") {
        effectiveFilter = {
          ...(segmentRow.definition as SegmentFilter),
          ...filter
        };
      }
    }

    const whereClause: Prisma.ContactWhereInput = {
      orgId,
      archivedAt: null
    };

    if (effectiveFilter.consentStatuses && effectiveFilter.consentStatuses.length > 0) {
      whereClause.consentStatus = { in: effectiveFilter.consentStatuses };
    }

    if (effectiveFilter.minLeadScore !== undefined || effectiveFilter.maxLeadScore !== undefined) {
      const scoreFilter: Prisma.IntNullableFilter = {};
      if (effectiveFilter.minLeadScore !== undefined) {
        scoreFilter.gte = effectiveFilter.minLeadScore;
      }
      if (effectiveFilter.maxLeadScore !== undefined) {
        scoreFilter.lte = effectiveFilter.maxLeadScore;
      }
      whereClause.leadScore = scoreFilter;
    }

    const tagFilters: Prisma.ContactTagWhereInput[] = [];
    if (effectiveFilter.tagIds && effectiveFilter.tagIds.length > 0) {
      tagFilters.push({ tagId: { in: effectiveFilter.tagIds } });
    }
    if (effectiveFilter.tagNames && effectiveFilter.tagNames.length > 0) {
      tagFilters.push({ tag: { name: { in: effectiveFilter.tagNames } } });
    }
    if (tagFilters.length > 0) {
      whereClause.tagLinks = {
        some: tagFilters.length === 1 ? tagFilters[0] : { OR: tagFilters }
      };
    }

    const listFilters: Prisma.ContactListMemberWhereInput[] = [];
    if (effectiveFilter.listIds && effectiveFilter.listIds.length > 0) {
      listFilters.push({ listId: { in: effectiveFilter.listIds } });
    }
    if (effectiveFilter.listNames && effectiveFilter.listNames.length > 0) {
      listFilters.push({ list: { name: { in: effectiveFilter.listNames } } });
    }
    if (listFilters.length > 0) {
      whereClause.listLinks = {
        some: listFilters.length === 1 ? listFilters[0] : { OR: listFilters }
      };
    }

    return client.contact.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      include: {
        tagLinks: { include: { tag: true } },
        listLinks: { include: { list: true } }
      }
    });
  };

  return tx ? execute(tx) : withTenantTransaction({ orgId }, execute);
}

export async function evaluateAudienceSnapshot(
  orgId: string,
  filter: SegmentFilter,
  tx?: Prisma.TransactionClient
) {
  const contacts = await evaluateSegmentContacts(orgId, filter, tx);
  return contacts.map((contact) => ({
    contactId: contact.id,
    phone: contact.phone,
    consentStatus: contact.consentStatus
  }));
}
