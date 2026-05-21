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

export async function mergeContacts(orgId: string, targetContactId: string, sourceContactId: string) {
  if (targetContactId === sourceContactId) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const [target, source] = await Promise.all([
      tx.contact.findFirst({ where: orgWhere(orgId, { id: targetContactId }), include: contactInclude }),
      tx.contact.findFirst({ where: orgWhere(orgId, { id: sourceContactId }), include: contactInclude })
    ]);

    if (!target || !source) {
      return null;
    }

    const mergedConsent = mergedConsentData(target, source);
    const mergedNotes = mergeContactNotes(target.notes, source.notes, source.displayName ?? source.phone);

    await tx.contact.update({
      where: { id: target.id },
      data: {
        email: target.email ?? source.email,
        firstName: target.firstName ?? source.firstName,
        lastName: target.lastName ?? source.lastName,
        displayName: target.displayName ?? source.displayName,
        optInSource: target.optInSource ?? source.optInSource,
        source: target.source ?? source.source,
        notes: mergedNotes,
        ...mergedConsent
      }
    });

    await mergeContactLabels(tx, orgId, target.id, [
      ...target.tagLinks.map((link) => link.tag.name),
      ...source.tagLinks.map((link) => link.tag.name)
    ], [
      ...target.listLinks.map((link) => link.list.name),
      ...source.listLinks.map((link) => link.list.name)
    ]);

    const targetCampaignIds = new Set(
      (await tx.campaignRecipient.findMany({
        where: { orgId, contactId: target.id },
        select: { campaignId: true }
      })).map((recipient) => recipient.campaignId)
    );
    const sourceCampaignRecipients = await tx.campaignRecipient.findMany({
      where: { orgId, contactId: source.id },
      select: { id: true, campaignId: true }
    });

    for (const recipient of sourceCampaignRecipients) {
      if (targetCampaignIds.has(recipient.campaignId)) {
        await tx.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "BLOCKED", blockReason: `Merged into contact ${target.id}` }
        });
      } else {
        await tx.campaignRecipient.update({
          where: { id: recipient.id },
          data: { contactId: target.id }
        });
      }
    }

    await tx.conversation.updateMany({ where: { orgId, contactId: source.id }, data: { contactId: target.id } });
    await tx.message.updateMany({ where: { orgId, contactId: source.id }, data: { contactId: target.id } });
    await tx.contact.update({
      where: { id: source.id },
      data: {
        archivedAt: source.archivedAt ?? new Date(),
        notes: mergeSourceArchiveNote(source.notes, target.displayName ?? target.phone, target.id)
      }
    });

    return tx.contact.findUniqueOrThrow({ where: { id: target.id }, include: contactInclude });
  });
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

async function mergeContactLabels(
  tx: Prisma.TransactionClient,
  orgId: string,
  contactId: string,
  tagNames: string[],
  listNames: string[]
) {
  for (const name of uniqueNames(tagNames)) {
    const tag = await tx.tag.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name }
    });
    await tx.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      update: {},
      create: { orgId, contactId, tagId: tag.id }
    });
  }

  for (const name of uniqueNames(listNames)) {
    const list = await tx.contactList.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name }
    });
    await tx.contactListMember.upsert({
      where: { listId_contactId: { listId: list.id, contactId } },
      update: {},
      create: { orgId, listId: list.id, contactId }
    });
  }
}

function mergedConsentData(
  target: { consentStatus: ConsentStatus; optInAt: Date | null; optedOutAt: Date | null },
  source: { consentStatus: ConsentStatus; optInAt: Date | null; optedOutAt: Date | null }
) {
  if (target.consentStatus === ConsentStatus.OPTED_OUT || source.consentStatus === ConsentStatus.OPTED_OUT) {
    return {
      consentStatus: ConsentStatus.OPTED_OUT,
      optInAt: null,
      optedOutAt: target.optedOutAt ?? source.optedOutAt ?? new Date()
    };
  }

  if (target.consentStatus === ConsentStatus.UNKNOWN && source.consentStatus === ConsentStatus.OPTED_IN) {
    return {
      consentStatus: ConsentStatus.OPTED_IN,
      optInAt: target.optInAt ?? source.optInAt ?? new Date(),
      optedOutAt: null
    };
  }

  return {};
}

function mergeContactNotes(targetNotes: string | null, sourceNotes: string | null, sourceLabel: string) {
  if (!sourceNotes) {
    return targetNotes;
  }

  if (!targetNotes) {
    return sourceNotes;
  }

  if (targetNotes.includes(sourceNotes)) {
    return targetNotes;
  }

  return `${targetNotes}\n\nMerged from ${sourceLabel}: ${sourceNotes}`;
}

function mergeSourceArchiveNote(sourceNotes: string | null, targetLabel: string, targetId: string) {
  const note = `Merged into ${targetLabel} (${targetId}).`;
  return sourceNotes ? `${sourceNotes}\n\n${note}` : note;
}

function uniqueNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}
