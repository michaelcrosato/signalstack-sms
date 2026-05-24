import { ConsentStatus } from "@prisma/client";
import { getContact, listArchivedContacts, listContacts } from "@/lib/db/repositories/contacts";

const productContactMetricRowItems = [
  { key: "total", label: "Active Contacts" },
  { key: "optedIn", label: "Opted In" },
  { key: "optedOut", label: "Opted Out" },
  { key: "unknown", label: "Unknown Consent" },
  { key: "archived", label: "Archived" }
] as const;

export const productContactMetricRows = Object.freeze(
  productContactMetricRowItems.map((row) => Object.freeze({ ...row }))
);

export async function getProductContacts(orgId: string) {
  const [contacts, archivedContacts] = await Promise.all([listContacts(orgId), listArchivedContacts(orgId)]);
  const summary = {
    total: contacts.length,
    archived: archivedContacts.length,
    optedIn: contacts.filter((contact) => contact.consentStatus === ConsentStatus.OPTED_IN).length,
    optedOut: contacts.filter((contact) => contact.consentStatus === ConsentStatus.OPTED_OUT).length,
    unknown: contacts.filter((contact) => contact.consentStatus === ConsentStatus.UNKNOWN).length
  };

  return {
    summary,
    metrics: productContactMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: summary[row.key]
    })),
    contacts: contacts.map(contactListRow),
    archivedContacts: archivedContacts.map(contactListRow)
  };
}

export async function getProductContactDetail(orgId: string, contactId: string) {
  const [contact, activeContacts] = await Promise.all([getContact(orgId, contactId), listContacts(orgId)]);

  if (!contact) {
    return null;
  }

  return {
    id: contact.id,
    displayName: contact.displayName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone),
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    phone: contact.phone,
    email: contact.email ?? "",
    consentStatus: contact.consentStatus,
    optInSource: contact.optInSource ?? "",
    source: contact.source ?? "",
    notes: contact.notes ?? "",
    tags: contact.tagLinks.map((link) => link.tag.name).sort(),
    lists: contact.listLinks.map((link) => link.list.name).sort(),
    archived: Boolean(contact.archivedAt),
    updatedAt: contact.updatedAt,
    mergeCandidates: activeContacts
      .filter((candidate) => candidate.id !== contact.id)
      .map(contactListRow)
  };
}

function contactListRow(contact: Awaited<ReturnType<typeof listContacts>>[number]) {
  return {
    id: contact.id,
    displayName: contact.displayName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone),
    phone: contact.phone,
    email: contact.email,
    consentStatus: contact.consentStatus,
    optInSource: contact.optInSource,
    source: contact.source,
    tags: contact.tagLinks.map((link) => link.tag.name).sort(),
    lists: contact.listLinks.map((link) => link.list.name).sort(),
    updatedAt: contact.updatedAt
  };
}
