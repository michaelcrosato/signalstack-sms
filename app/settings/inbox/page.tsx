import { ConversationStatus } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listConversations } from "@/lib/db/repositories/inbox";

export const dynamic = "force-dynamic";

export default async function InboxOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const conversations = await listConversations(currentOrg.orgId);
  const openConversations = conversations.filter((conversation) => conversation.status === ConversationStatus.OPEN);
  const resolvedConversations = conversations.filter((conversation) => conversation.status === ConversationStatus.RESOLVED);
  const assignedConversations = conversations.filter((conversation) => Boolean(conversation.assignedToUserId));
  const recentMessageCount = conversations.reduce((total, conversation) => total + conversation.messages.length, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/campaigns">
          Campaign Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contacts">
          Contact Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/templates">
          Template Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/audience">
          Audience Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/usage">
          Usage & Analytics
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/team">
          Team Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/webhooks">
          Webhook Operations
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Inbox Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only shared inbox review for {currentOrg.orgName}. This page does not create messages, assign
            conversations, resolve threads, send SMS, call providers, send notifications, mutate contacts, or enable live
            messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Conversations" value={String(conversations.length)} />
        <Metric label="Open" value={String(openConversations.length)} />
        <Metric label="Assigned" value={String(assignedConversations.length)} />
        <Metric label="Recent messages" value={String(recentMessageCount)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Conversation Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Open" value={String(openConversations.length)} />
            <StatusRow label="Resolved" value={String(resolvedConversations.length)} />
            <StatusRow label="Assigned" value={String(assignedConversations.length)} />
            <StatusRow label="Unassigned" value={String(conversations.length - assignedConversations.length)} />
          </dl>
        </Panel>

        <Panel title="Safety Boundary">
          <ul className="grid gap-2 text-sm text-slate-700">
            <li>Inbound demo messages remain local API actions only.</li>
            <li>STOP/HELP processing remains local consent metadata only.</li>
            <li>Assignments, notes, and resolution changes are not available from this view.</li>
            <li>No provider replies, notifications, billing records, or live SMS are created.</li>
          </ul>
        </Panel>
      </section>

      <Panel title="Recent Conversations">
        <ul className="grid gap-3 text-sm">
          {conversations.length > 0 ? (
            conversations.slice(0, 12).map((conversation) => (
              <li key={conversation.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">
                    {conversation.contact?.displayName ?? conversation.contact?.phone ?? "Unknown contact"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {conversation.assignedTo?.displayName ?? "Unassigned"} / {conversation.messages.length} recent messages /{" "}
                    {conversation.internalNotes.length} recent notes
                  </p>
                </div>
                <span className="text-slate-600">{conversation.status}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No conversations recorded.</li>
          )}
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
