import { Prisma } from "@prisma/client";
import {
  publicSegmentDefinitionSchema
} from "@/lib/validation/public-api-resources";

export const publicOrganizationSelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.OrganizationSelect;

export const publicContactSelect = {
  id: true,
  phone: true,
  email: true,
  firstName: true,
  lastName: true,
  displayName: true,
  consentStatus: true,
  optInSource: true,
  optInAt: true,
  optedOutAt: true,
  consentCapturedAt: true,
  consentMethod: true,
  consentDisclosure: true,
  source: true,
  notes: true,
  leadScore: true,
  leadStage: true,
  leadQualifiedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  tagLinks: {
    select: { tag: { select: { id: true, name: true, color: true } } },
    orderBy: { tag: { name: "asc" } }
  },
  listLinks: {
    select: { list: { select: { id: true, name: true } } },
    orderBy: { list: { name: "asc" } }
  }
} satisfies Prisma.ContactSelect;

export const publicTagSelect = {
  id: true,
  name: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { contacts: true } }
} satisfies Prisma.TagSelect;

export const publicListSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true } }
} satisfies Prisma.ContactListSelect;

export const publicSegmentSelect = {
  id: true,
  name: true,
  description: true,
  definition: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.SegmentSelect;

export const publicTemplateSelect = {
  id: true,
  name: true,
  body: true,
  variables: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { campaigns: true } }
} satisfies Prisma.MessageTemplateSelect;

type PublicOrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof publicOrganizationSelect }>;
type PublicContactRow = Prisma.ContactGetPayload<{ select: typeof publicContactSelect }>;
type PublicTagRow = Prisma.TagGetPayload<{ select: typeof publicTagSelect }>;
type PublicListRow = Prisma.ContactListGetPayload<{ select: typeof publicListSelect }>;
type PublicSegmentRow = Prisma.SegmentGetPayload<{ select: typeof publicSegmentSelect }>;
type PublicTemplateRow = Prisma.MessageTemplateGetPayload<{ select: typeof publicTemplateSelect }>;

const iso = (value: Date | null) => value?.toISOString() ?? null;

export function serializePublicOrganization(row: PublicOrganizationRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicContact(row: PublicContactRow) {
  const tags = row.tagLinks
    .map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const lists = row.listLinks
    .map(({ list }) => ({ id: list.id, name: list.name }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    consentStatus: row.consentStatus,
    optInSource: row.optInSource,
    optInAt: iso(row.optInAt),
    optedOutAt: iso(row.optedOutAt),
    consentEvidence: {
      capturedAt: iso(row.consentCapturedAt),
      method: row.consentMethod,
      disclosure: row.consentDisclosure
    },
    source: row.source,
    notes: row.notes,
    leadScore: row.leadScore,
    leadStage: row.leadStage,
    leadQualifiedAt: iso(row.leadQualifiedAt),
    archivedAt: iso(row.archivedAt),
    tags,
    lists,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicContactWebhookData(row: PublicContactRow) {
  return {
    contactId: row.id,
    phone: row.phone,
    consentStatus: row.consentStatus,
    archivedAt: iso(row.archivedAt),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicTag(row: PublicTagRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    contactCount: row._count.contacts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicList(row: PublicListRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    memberCount: row._count.members,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicSegment(row: PublicSegmentRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    definition: publicSegmentDefinitionSchema.parse(row.definition),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializePublicTemplate(row: PublicTemplateRow) {
  if (!Array.isArray(row.variables) || row.variables.some((value) => typeof value !== "string")) {
    throw new TypeError("The stored template variables are invalid.");
  }
  const variables = row.variables as string[];
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    variables,
    campaignCount: row._count.campaigns,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
