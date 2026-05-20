import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function AudienceOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [tags, lists, segments] = await Promise.all([
    prisma.tag.findMany({
      where: { orgId: currentOrg.orgId },
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: "asc" },
      take: 30
    }),
    prisma.contactList.findMany({
      where: { orgId: currentOrg.orgId },
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" },
      take: 30
    }),
    prisma.segment.findMany({
      where: { orgId: currentOrg.orgId },
      orderBy: { updatedAt: "desc" },
      take: 20
    })
  ]);

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
        <Link className="text-sm font-medium text-teal-700" href="/settings/templates">
          Template Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/campaigns">
          Campaign Operations
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Audience Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only audience label and saved segment review for {currentOrg.orgName}. This page does not create lists,
            update tags, evaluate segments for sending, mutate contacts, call providers, send notifications, send SMS,
            expose secrets, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Tags" value={String(tags.length)} />
        <Metric label="Lists" value={String(lists.length)} />
        <Metric label="Segments" value={String(segments.length)} />
        <Metric label="Live sends" value="blocked" />
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

      <Panel title="Saved Segments">
        <ul className="grid gap-3 text-sm">
          {segments.length > 0 ? (
            segments.map((segment) => (
              <li key={segment.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">{segment.name}</p>
                  <p className="mt-1 break-words text-xs text-slate-600">{JSON.stringify(segment.definition)}</p>
                </div>
                <time className="text-slate-600" dateTime={segment.updatedAt.toISOString()}>
                  {segment.updatedAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No saved segments recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>Audience labels and segment definitions are displayed as local metadata only.</li>
          <li>Segment evaluation for campaign recipients remains separate from this page.</li>
          <li>Contact membership changes are not available from this view.</li>
          <li>No provider calls, billing records, notifications, live SMS, or mutations are created.</li>
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
