import Link from "next/link";
import type { ReactNode } from "react";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getUsageSummary } from "@/lib/billing/metering";
import { listCampaigns } from "@/lib/db/repositories/campaigns";
import { listContacts } from "@/lib/db/repositories/contacts";
import { listConversations } from "@/lib/db/repositories/inbox";
import { listProviderPhoneNumbers } from "@/lib/db/repositories/provider-numbers";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";

export const dynamic = "force-dynamic";

const reportLinks = [
  { href: "/settings/demo", label: "Demo Operations", scope: "seeded demo readiness and runtime gates" },
  { href: "/settings/operations", label: "Operations Index", scope: "grouped local operator surface map" },
  { href: "/settings/usage", label: "Usage & Analytics", scope: "tenant metrics and local usage" },
  { href: "/settings/exports", label: "Admin Exports", scope: "bounded local CSV links" },
  { href: "/settings/readiness-audit", label: "Readiness Audit", scope: "go-live readiness history" },
  { href: "/settings/campaigns", label: "Campaign Operations", scope: "campaign and queue status" },
  { href: "/settings/delivery", label: "Delivery Operations", scope: "message delivery metadata" },
  { href: "/settings/workflows", label: "Workflow Operations", scope: "demo path checkpoint map" },
  { href: "/settings/billing", label: "Billing Operations", scope: "local billing metadata" }
];

export default async function ReportsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [analytics, usage, contacts, campaigns, conversations, numbers, auditEvents] = await Promise.all([
    getAnalyticsOverview(currentOrg.orgId),
    getUsageSummary(currentOrg.orgId),
    listContacts(currentOrg.orgId),
    listCampaigns(currentOrg.orgId),
    listConversations(currentOrg.orgId),
    listProviderPhoneNumbers(currentOrg.orgId),
    listLiveReadinessAuditEvents(currentOrg.orgId, 5)
  ]);

  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === "SCHEDULED").length;
  const openConversations = conversations.filter((conversation) => conversation.status === "OPEN").length;
  const optedInContacts = contacts.filter((contact) => contact.consentStatus === "OPTED_IN").length;
  const defaultNumbers = numbers.filter((number) => number.isDefault).length;
  const totalUsageQuantity = Object.values(usage.totals).reduce((total, quantity) => total + quantity, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/usage">
          Usage & Analytics
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/operations">
          Operations Index
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/exports">
          Admin Exports
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/readiness-audit">
          Readiness Audit
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/workflows">
          Workflow Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/demo">
          Demo Operations
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Reporting Index</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local reporting map for existing tenant metrics, exports, and operational reports. It does not
            execute reports, create exports, mutate records, call providers, send notifications, expose secrets, or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Contacts" value={analytics.contacts.total} />
        <Metric label="Campaigns" value={analytics.campaigns.total} />
        <Metric label="Messages" value={analytics.messages.total} />
        <Metric label="Usage Quantity" value={totalUsageQuantity} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Report Surfaces">
          <ul className="grid gap-3 text-sm">
            {reportLinks.map((item) => (
              <li key={item.href} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <Link className="font-semibold text-teal-700" href={item.href}>
                    {item.label}
                  </Link>
                  <p className="mt-1 text-slate-600">{item.scope}</p>
                </div>
                <span className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
                  local
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Operational Snapshot">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Opted-in contacts" value={String(optedInContacts)} />
            <StatusRow label="Scheduled campaigns" value={String(scheduledCampaigns)} />
            <StatusRow label="Open conversations" value={String(openConversations)} />
            <StatusRow label="Default numbers" value={String(defaultNumbers)} />
            <StatusRow label="Live billing blocked" value={String(usage.liveBillingBlocked)} />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Recent Readiness Signals">
          <ul className="grid gap-3 text-sm">
            {auditEvents.length > 0 ? (
              auditEvents.map((event) => (
                <li key={event.id} className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                  <span className="font-medium text-slate-950">
                    {event.action} / {event.subjectType}
                  </span>
                  <time className="text-slate-600" dateTime={event.createdAt.toISOString()}>
                    {event.createdAt.toISOString()}
                  </time>
                </li>
              ))
            ) : (
              <li className="text-slate-600">No readiness audit events recorded.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Safety Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Record mutations" value="none" />
            <StatusRow label="Provider calls" value="none" />
            <StatusRow label="Billing provider calls" value="none" />
            <StatusRow label="Notifications" value="none" />
            <StatusRow label="Secrets" value="not exposed" />
            <StatusRow label="Live feature enablement" value="blocked" />
          </dl>
        </Panel>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
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
