import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const retentionSignals = [
  {
    name: "Hard deletion",
    status: "blocked",
    detail: "Contact delete APIs soft-archive records with archivedAt; this page does not remove rows."
  },
  {
    name: "Tenant boundary",
    status: "org scoped",
    detail: "Counts are filtered to the current organization before rendering."
  },
  {
    name: "Exports",
    status: "local metadata only",
    detail: "Available CSV exports remain limited to readiness audit and redacted provider rotation metadata."
  },
  {
    name: "External impact",
    status: "none",
    detail: "No provider, billing, notification, live AI, or live messaging action is available here."
  }
];

export default async function DataOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [
    activeContacts,
    archivedContacts,
    recentArchivedContacts,
    contactImports,
    messages,
    conversations,
    queueJobs,
    webhookEvents,
    usageEvents,
    readinessAuditEvents,
    credentialRotations
  ] = await Promise.all([
    prisma.contact.count({ where: { orgId: currentOrg.orgId, archivedAt: null } }),
    prisma.contact.count({ where: { orgId: currentOrg.orgId, archivedAt: { not: null } } }),
    prisma.contact.findMany({
      where: { orgId: currentOrg.orgId, archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      take: 8
    }),
    prisma.contactImport.findMany({
      where: { orgId: currentOrg.orgId },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.message.count({ where: { orgId: currentOrg.orgId } }),
    prisma.conversation.count({ where: { orgId: currentOrg.orgId } }),
    prisma.queueJob.count({ where: { orgId: currentOrg.orgId } }),
    prisma.webhookEvent.count({ where: { orgId: currentOrg.orgId } }),
    prisma.usageEvent.count({ where: { orgId: currentOrg.orgId } }),
    prisma.liveReadinessAuditEvent.count({ where: { orgId: currentOrg.orgId } }),
    prisma.providerCredentialRotation.count({ where: { orgId: currentOrg.orgId } })
  ]);

  const importedRows = contactImports.reduce((total, item) => total + item.importedRows, 0);
  const failedRows = contactImports.reduce((total, item) => total + item.failedRows, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contacts">
          Contact Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/exports">
          Admin Exports
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/security">
          Security Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Data Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local data governance review for {currentOrg.orgName}. This page displays tenant-scoped record
            totals, soft-archive state, import row totals, and local audit/export boundaries only; it does not delete
            data, run exports, mutate records, call providers, create billing records, send notifications, expose secrets,
            or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Active contacts" value={String(activeContacts)} />
        <Metric label="Archived contacts" value={String(archivedContacts)} />
        <Metric label="Messages" value={String(messages)} />
        <Metric label="Webhook events" value={String(webhookEvents)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Soft Archive">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Active contact rows" value={String(activeContacts)} />
            <StatusRow label="Archived contact rows" value={String(archivedContacts)} />
            <StatusRow label="Hard delete available" value="false" />
            <StatusRow label="Archive field" value="archivedAt" />
          </dl>
        </Panel>

        <Panel title="Import Ledger">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Recent import records" value={String(contactImports.length)} />
            <StatusRow label="Imported rows" value={String(importedRows)} />
            <StatusRow label="Failed rows" value={String(failedRows)} />
            <StatusRow label="Processing mode" value="local CSV" />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Local Record Totals">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Conversations" value={String(conversations)} />
            <StatusRow label="Queue jobs" value={String(queueJobs)} />
            <StatusRow label="Usage events" value={String(usageEvents)} />
            <StatusRow label="Readiness audit events" value={String(readinessAuditEvents)} />
            <StatusRow label="Credential rotations" value={String(credentialRotations)} />
          </dl>
        </Panel>

        <Panel title="Retention Signals">
          <ul className="grid gap-3 text-sm">
            {retentionSignals.map((signal) => (
              <li key={signal.name} className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[9rem_9rem_1fr]">
                <span className="font-medium text-slate-950">{signal.name}</span>
                <span className="text-slate-700">{signal.status}</span>
                <span className="text-slate-600">{signal.detail}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Recent Archived Contacts">
        <ul className="grid gap-3 text-sm">
          {recentArchivedContacts.length > 0 ? (
            recentArchivedContacts.map((contact) => (
              <li key={contact.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">{contact.displayName ?? contact.phone}</p>
                  <p className="mt-1 text-xs text-slate-600">{contact.phone}</p>
                </div>
                <time className="text-slate-600" dateTime={contact.archivedAt?.toISOString()}>
                  {contact.archivedAt?.toISOString() ?? "not archived"}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No archived contacts recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>This view only reads tenant-scoped local database counts and recent archived contact metadata.</li>
          <li>Data removal remains intentionally absent; contact deletion is soft-archive behavior elsewhere.</li>
          <li>Export links remain on `/settings/exports` and use existing local CSV routes only.</li>
          <li>No mutations, hard deletes, provider calls, billing records, notifications, live AI, SMS, email, or secret exposure occur here.</li>
        </ul>
      </Panel>
    </main>
  );
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
