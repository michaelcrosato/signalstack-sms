import Link from "next/link";
import type { ReactNode } from "react";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getUsageSummary } from "@/lib/billing/metering";
import { listCampaigns } from "@/lib/db/repositories/campaigns";
import { listContacts } from "@/lib/db/repositories/contacts";
import { listConversations } from "@/lib/db/repositories/inbox";
import { listProviderPhoneNumbers } from "@/lib/db/repositories/provider-numbers";
import { getDemoOperationsCheckpoints, getDemoOperationsLinks } from "@/lib/operations/operator-surfaces";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

const demoCheckpoints = getDemoOperationsCheckpoints();
const demoOperationsLinks = getDemoOperationsLinks();

export default async function DemoOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [contacts, campaigns, conversations, numbers, analytics, usage] = await Promise.all([
    listContacts(currentOrg.orgId),
    listCampaigns(currentOrg.orgId),
    listConversations(currentOrg.orgId),
    listProviderPhoneNumbers(currentOrg.orgId),
    getAnalyticsOverview(currentOrg.orgId),
    getUsageSummary(currentOrg.orgId)
  ]);
  const status = getSystemStatus(process.env);
  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === "SCHEDULED").length;
  const openConversations = conversations.filter((conversation) => conversation.status === "OPEN").length;
  const usageTotal = Object.values(usage.totals).reduce((total, quantity) => total + quantity, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/operations">
          Operations Index
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/workflows">
          Workflow Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/reports">
          Reporting Index
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Demo Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local demo checkpoint for {currentOrg.orgName}. This view summarizes seeded demo readiness,
            workflow links, local metrics, and external-impact gates without importing data, scheduling campaigns,
            creating messages, executing reports, calling providers, billing, notifying, exposing secrets, or enabling
            live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="Contacts" value={String(contacts.length)} />
        <Metric label="Campaigns" value={String(campaigns.length)} />
        <Metric label="Scheduled" value={String(scheduledCampaigns)} />
        <Metric label="Open inbox" value={String(openConversations)} />
        <Metric label="Numbers" value={String(numbers.length)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Demo Readiness">
          <ol className="grid gap-3 text-sm">
            {demoCheckpoints.map((checkpoint, index) => (
              <li key={checkpoint.name} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[42px_170px_140px_1fr]">
                <span className="font-semibold text-slate-500">{index + 1}</span>
                <Link className="font-semibold text-teal-700" href={checkpoint.href}>
                  {checkpoint.name}
                </Link>
                <span className="text-slate-600">{checkpoint.signal}</span>
                <span className="text-slate-700">{checkpoint.boundary}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Runtime Gates">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
            <StatusRow label="Demo mode" value={String(status.safety.demoMode)} />
            <StatusRow label="Messaging provider" value={status.safety.messagingProvider} />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
            <StatusRow label="Live messaging" value={String(status.safety.liveMessagingEnabled)} />
            <StatusRow label="Live billing" value={String(status.safety.liveBillingEnabled)} />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel title="Seed Signals">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Opted in" value={String(analytics.contacts.optedIn)} />
            <StatusRow label="Opted out" value={String(analytics.contacts.optedOut)} />
            <StatusRow label="Messages" value={String(analytics.messages.total)} />
          </dl>
        </Panel>

        <Panel title="Scenario Signals">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Campaigns" value={String(analytics.campaigns.total)} />
            <StatusRow label="Conversations" value={String(analytics.conversations.total)} />
            <StatusRow label="Usage total" value={String(usageTotal)} />
          </dl>
        </Panel>

        <Panel title="Operational Links">
          <ul className="grid gap-3 text-sm">
            {demoOperationsLinks.map((link) => (
              <OperationLink key={link.href} href={link.href} label={link.label} note={link.note} />
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>No demo workflow action is executed: no imports, campaign scheduling, worker runs, inbox replies, AI prompts, reports, exports, or billing events.</li>
          <li>No records are created, updated, deleted, enqueued, exported, replayed, charged, sent, notified, or provider-verified from this view.</li>
          <li>No provider APIs, live AI providers, Stripe APIs, notification services, Redis queues, email systems, SMS sends, or outbound webhooks are called.</li>
          <li>No raw environment values, credentials, token fingerprints, provider verification results, full message bodies, or secret-like values are displayed.</li>
        </ul>
      </Panel>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function OperationLink({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <li className="rounded border border-slate-200 p-4">
      <Link className="font-semibold text-teal-700" href={href}>
        {label}
      </Link>
      <p className="mt-2 text-slate-600">{note}</p>
    </li>
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
      <dd className="text-right font-medium text-slate-950">{value}</dd>
    </div>
  );
}
