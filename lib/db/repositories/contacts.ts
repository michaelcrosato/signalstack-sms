import { ContactImportStatus, ConsentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { orgWhere } from "@/lib/db/tenant";
import type { ContactCreateInput, ContactUpdateInput } from "@/lib/validation/contacts";
import type { ParsedContactImport } from "@/lib/csv/import-contacts";

const contactInclude = {
  tagLinks: { include: { tag: true } },
  listLinks: { include: { list: true } }
} satisfies Prisma.ContactInclude;

export async function listContacts(orgId: string) {
  return prisma.contact.findMany({
    where: { orgId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: contactInclude
  });
}

export async function listArchivedContacts(orgId: string) {
  return prisma.contact.findMany({
    where: { orgId, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    include: contactInclude
  });
}

export async function getContact(orgId: string, contactId: string) {
  return prisma.contact.findFirst({
    where: orgWhere(orgId, { id: contactId }),
    include: contactInclude
  });
}

export async function upsertContact(orgId: string, input: ContactCreateInput) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.upsert({
      where: { orgId_phone: { orgId, phone: input.phone } },
      update: contactWriteData(input),
      create: {
        orgId,
        phone: input.phone,
        ...contactWriteData(input)
      }
    });

    await syncContactLabels(tx, orgId, contact.id, input.tagNames, input.listNames);
    return tx.contact.findUniqueOrThrow({ where: { id: contact.id }, include: contactInclude });
  });
}

export async function updateContact(orgId: string, contactId: string, input: ContactUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({ where: orgWhere(orgId, { id: contactId }) });
    if (!existing) {
      return null;
    }

    const contact = await tx.contact.update({
      where: { id: contactId },
      data: {
        ...contactWriteData(input),
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null
      }
    });

    if (input.tagNames || input.listNames) {
      await syncContactLabels(tx, orgId, contact.id, input.tagNames ?? [], input.listNames ?? []);
    }

    return tx.contact.findUniqueOrThrow({ where: { id: contact.id }, include: contactInclude });
  });
}

export async function archiveContact(orgId: string, contactId: string) {
  return updateContact(orgId, contactId, { archived: true });
}

export async function importContacts(
  orgId: string,
  parsed: ParsedContactImport,
  filename?: string
) {
  return prisma.$transaction(async (tx) => {
    const importRecord = await tx.contactImport.create({
      data: {
        orgId,
        filename,
        status: ContactImportStatus.PENDING,
        totalRows: parsed.totalRows,
        failedRows: parsed.errors.length,
        errors: parsed.errors.length > 0 ? parsed.errors : undefined
      }
    });

    for (const contact of parsed.contacts) {
      const saved = await tx.contact.upsert({
        where: { orgId_phone: { orgId, phone: contact.phone } },
        update: contactWriteData(contact),
        create: { orgId, phone: contact.phone, ...contactWriteData(contact) }
      });
      await syncContactLabels(tx, orgId, saved.id, contact.tagNames, contact.listNames);
    }

    return tx.contactImport.update({
      where: { id: importRecord.id },
      data: {
        status: parsed.errors.length > 0 ? ContactImportStatus.FAILED : ContactImportStatus.COMPLETED,
        importedRows: parsed.contacts.length,
        completedAt: new Date()
      }
    });
  });
}

function contactWriteData(input: Partial<ContactCreateInput>) {
  const optedOutAt =
    input.consentStatus === ConsentStatus.OPTED_OUT
      ? new Date()
      : input.consentStatus === ConsentStatus.OPTED_IN
        ? null
        : undefined;
  const optInAt = input.consentStatus === ConsentStatus.OPTED_IN ? new Date() : undefined;

  return {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: input.displayName,
    consentStatus: input.consentStatus,
    optInSource: input.optInSource,
    optInAt,
    optedOutAt,
    source: input.source,
    notes: input.notes
  };
}

async function syncContactLabels(
  tx: Prisma.TransactionClient,
  orgId: string,
  contactId: string,
  tagNames: string[],
  listNames: string[]
) {
  await tx.contactTag.deleteMany({ where: { orgId, contactId } });
  await tx.contactListMember.deleteMany({ where: { orgId, contactId } });

  for (const name of uniqueNames(tagNames)) {
    const tag = await tx.tag.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name }
    });
    await tx.contactTag.create({ data: { orgId, contactId, tagId: tag.id } });
  }

  for (const name of uniqueNames(listNames)) {
    const list = await tx.contactList.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name }
    });
    await tx.contactListMember.create({ data: { orgId, contactId, listId: list.id } });
  }
}

function uniqueNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}
