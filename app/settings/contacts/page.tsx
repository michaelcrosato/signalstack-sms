import { ConsentStatus, ContactImportStatus } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";
import { listContacts } from "@/lib/db/repositories/contacts";
import { getContactOperationLinks } from "@/lib/operations/operator-surfaces";

export const dynamic = "force-dynamic";

const operationLinks = getContactOperationLinks();

export default async function ContactOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [contacts, imports, tags, lists] = await Promise.all([
    listContacts(currentOrg.orgId),
    prisma.contactImport.findMany({
      where: { orgId: currentOrg.orgId },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.tag.findMany({
      where: { orgId: currentOrg.orgId },
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: "asc" },
      take: 20
    }),
    prisma.contactList.findMany({
      where: { orgId: currentOrg.orgId },
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" },
      take: 20
    })
  ]);

  const optedIn = countContacts(contacts, ConsentStatus.OPTED_IN);
  const optedOut = countContacts(contacts, ConsentStatus.OPTED_OUT);
  const unknownConsent = countContacts(contacts, ConsentStatus.UNKNOWN);
  const importedRows = imports.reduce((total, item) => total + item.importedRows, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          {operationLinks.map((link) => (
            <Link key={link.href} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Contact Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only contact, consent, import, tag, and list review for {currentOrg.orgName}. This page does not import
            contacts, update consent, mutate labels, send SMS, call providers, send notifications, expose secrets, or
            enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Contacts" value={String(contacts.length)} />
        <Metric label="Opted in" value={String(optedIn)} />
        <Metric label="Opted out" value={String(optedOut)} />
        <Metric label="Imported rows" value={String(importedRows)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Consent Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Opted in" value={String(optedIn)} />
            <StatusRow label="Opted out" value={String(optedOut)} />
            <StatusRow label="Unknown" value={String(unknownConsent)} />
            <StatusRow label="Active contacts" value={String(contacts.length)} />
          </dl>
        </Panel>

        <Panel title="Import Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Completed" value={String(countImports(imports, ContactImportStatus.COMPLETED))} />
            <StatusRow label="Failed" value={String(countImports(imports, ContactImportStatus.FAILED))} />
            <StatusRow label="Pending" value={String(countImports(imports, ContactImportStatus.PENDING))} />
            <StatusRow label="Failed rows" value={String(imports.reduce((total, item) => total + item.failedRows, 0))} />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Tags">
          <ul className="grid gap-3 text-sm">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <li key={tag.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-950">{tag.name}</span>
                  <span className="text-slate-600">{tag._count.contacts} contacts</span>
                </li>
              ))
            ) : (
              <li className="text-slate-600">No tags recorded.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Lists">
          <ul className="grid gap-3 text-sm">
            {lists.length > 0 ? (
              lists.map((list) => (
                <li key={list.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-950">{list.name}</span>
                  <span className="text-slate-600">{list._count.members} members</span>
                </li>
              ))
            ) : (
              <li className="text-slate-600">No lists recorded.</li>
            )}
          </ul>
        </Panel>
      </section>

      <Panel title="Recent Imports">
        <ul className="grid gap-3 text-sm">
          {imports.length > 0 ? (
            imports.map((item) => (
              <li key={item.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">{item.filename ?? "unnamed import"}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {item.importedRows} imported / {item.failedRows} failed / {item.totalRows} total
                  </p>
                </div>
                <span className="text-slate-600">{item.status}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No contact imports recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Recent Contacts">
        <ul className="grid gap-3 text-sm">
          {contacts.length > 0 ? (
            contacts.slice(0, 12).map((contact) => (
              <li key={contact.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">{contact.displayName ?? contact.phone}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {contact.phone} / {contact.tagLinks.length} tags / {contact.listLinks.length} lists
                  </p>
                </div>
                <span className="text-slate-600">{contact.consentStatus}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No contacts recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>CSV import remains API-driven and local to the current tenant.</li>
          <li>Consent updates remain explicit contact or inbound-message actions.</li>
          <li>Tags and lists are displayed as local labels only from this view.</li>
          <li>No provider calls, billing records, notifications, live SMS, or mutations are created.</li>
        </ul>
      </Panel>
    </main>
  );
}

function countContacts(contacts: Awaited<ReturnType<typeof listContacts>>, status: ConsentStatus) {
  return contacts.filter((contact) => contact.consentStatus === status).length;
}

function countImports(
  imports: Awaited<ReturnType<typeof prisma.contactImport.findMany>>,
  status: ContactImportStatus
) {
  return imports.filter((item) => item.status === status).length;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-950">{value}</dd>
    </div>
  );
}


