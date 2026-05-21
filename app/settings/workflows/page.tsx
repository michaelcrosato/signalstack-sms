import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { getUsageSummary } from "@/lib/billing/metering";
import { listCampaigns } from "@/lib/db/repositories/campaigns";
import { listContacts } from "@/lib/db/repositories/contacts";
import { listConversations } from "@/lib/db/repositories/inbox";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

const workflowSteps = [
  {
    name: "Audience intake",
    href: "/settings/contacts",
    owner: "Contacts",
    boundary: "CSV import and consent state remain local records; no labels, consent, or provider sends are changed here."
  },
  {
    name: "Campaign readiness",
    href: "/settings/campaigns",
    owner: "Campaigns",
    boundary: "Draft, preflight, and scheduled metadata are reviewed without scheduling, canceling, or sending messages."
  },
  {
    name: "Queue handoff",
    href: "/settings/queue",
    owner: "Queue",
    boundary: "Durable job state and worker limits are displayed without enqueueing, polling, Redis calls, or queue mutation."
  },
  {
    name: "Inbox response",
    href: "/settings/inbox",
    owner: "Inbox",
    boundary: "Conversation and note metadata are visible without creating replies, assigning threads, or changing consent."
  },
  {
    name: "Delivery evidence",
    href: "/settings/delivery",
    owner: "Delivery",
    boundary: "Existing message status metadata is reviewed without retries, webhook replay, provider calls, or SMS sends."
  },
  {
    name: "AI and reporting",
    href: "/settings/reports",
    owner: "Reporting",
    boundary: "Fake AI, usage, analytics, and report links are summarized without prompts, exports, paid AI, or billing artifacts."
  }
];

export default async function WorkflowOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [contacts, campaigns, conversations, analytics, usage] = await Promise.all([
    listContacts(currentOrg.orgId),
    listCampaigns(currentOrg.orgId),
    listConversations(currentOrg.orgId),
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
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/integrations">
          Integration Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/reports">
          Reporting Index
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/releases">
          Release Operations
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Workflow Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only workflow checkpoint for {currentOrg.orgName}. This view connects the local demo path across
            audience, campaign, queue, inbox, delivery, AI, usage, and reporting surfaces without executing workflow
            steps, mutating records, exporting data, calling providers, billing, notifying, or enabling live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="Contacts" value={String(contacts.length)} />
        <Metric label="Campaigns" value={String(campaigns.length)} />
        <Metric label="Scheduled" value={String(scheduledCampaigns)} />
        <Metric label="Open inbox" value={String(openConversations)} />
        <Metric label="Usage events" value={String(usage.recentEvents.length)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Workflow Checkpoints">
          <ol className="grid gap-3 text-sm">
            {workflowSteps.map((step, index) => (
              <li key={step.name} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[42px_170px_120px_1fr]">
                <span className="font-semibold text-slate-500">{index + 1}</span>
                <Link className="font-semibold text-teal-700" href={step.href}>
                  {step.name}
                </Link>
                <span className="text-slate-600">{step.owner}</span>
                <span className="text-slate-700">{step.boundary}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Runtime Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
            <StatusRow label="Messaging provider" value={status.safety.messagingProvider} />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
            <StatusRow label="Live messaging" value={String(status.safety.liveMessagingEnabled)} />
            <StatusRow label="Live billing" value={String(status.safety.liveBillingEnabled)} />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel title="Audience Signal">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Contacts" value={String(analytics.contacts.total)} />
            <StatusRow label="Opted in" value={String(analytics.contacts.optedIn)} />
            <StatusRow label="Opted out" value={String(analytics.contacts.optedOut)} />
          </dl>
        </Panel>

        <Panel title="Campaign Signal">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Campaigns" value={String(analytics.campaigns.total)} />
            <StatusRow label="Messages" value={String(analytics.messages.total)} />
            <StatusRow label="Usage total" value={String(usageTotal)} />
          </dl>
        </Panel>

        <Panel title="Inbox Signal">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Conversations" value={String(analytics.conversations.total)} />
            <StatusRow label="Open" value={String(openConversations)} />
            <StatusRow label="Recent usage" value={String(usage.recentEvents.length)} />
          </dl>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>No workflow actions are executed: no imports, campaign scheduling, worker runs, inbox replies, delivery retries, prompts, reports, exports, or billing events.</li>
          <li>No provider APIs, live AI providers, Stripe APIs, notification services, Redis queues, or outbound webhooks are called.</li>
          <li>No records are created, updated, deleted, enqueued, exported, replayed, charged, sent, notified, or verified from this view.</li>
          <li>No credentials, token fingerprints, raw environment values, provider verification results, or secret-like values are displayed.</li>
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
