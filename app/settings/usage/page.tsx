import { UsageEventType } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { getUsageSummary } from "@/lib/billing/metering";

export const dynamic = "force-dynamic";

const usageTypes = [
  UsageEventType.CONTACT_IMPORTED,
  UsageEventType.MESSAGE_INBOUND,
  UsageEventType.CAMPAIGN_SCHEDULED,
  UsageEventType.AI_REQUEST
];

export default async function UsageSettingsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [analytics, usage] = await Promise.all([getAnalyticsOverview(currentOrg.orgId), getUsageSummary(currentOrg.orgId)]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/compliance">
          Compliance Detail
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/system">
          System Status
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/campaigns">
          Campaign Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Usage & Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local metering for {currentOrg.orgName}. This page does not create billing records, call Stripe, send
            notifications, call providers, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Contacts" value={String(analytics.contacts.total)} />
        <Metric label="Campaigns" value={String(analytics.campaigns.total)} />
        <Metric label="Conversations" value={String(analytics.conversations.total)} />
        <Metric label="Messages" value={String(analytics.messages.total)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Local Usage Totals">
          <dl className="grid gap-3 text-sm">
            {usageTypes.map((type) => (
              <StatusRow key={type} label={formatUsageType(type)} value={String(usage.totals[type])} />
            ))}
          </dl>
        </Panel>

        <Panel title="Billing Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Billing account status" value={usage.billingAccount.status} />
            <StatusRow label="Live billing enabled" value={String(usage.billingAccount.liveBillingEnabled)} />
            <StatusRow label="Live billing blocked" value={String(usage.liveBillingBlocked)} />
            <StatusRow label="Stripe customer" value={usage.billingAccount.stripeCustomerId ? "placeholder present" : "not configured"} />
          </dl>
        </Panel>
      </section>

      <Panel title="Conversation Analytics">
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <StatusRow label="Open conversations" value={String(analytics.conversations.open)} />
          <StatusRow label="Resolved conversations" value={String(analytics.conversations.resolved)} />
          <StatusRow label="Opted-out contacts" value={String(analytics.contacts.optedOut)} />
        </dl>
      </Panel>

      <Panel title="Recent Usage Events">
        <ul className="grid gap-3 text-sm">
          {usage.recentEvents.length > 0 ? (
            usage.recentEvents.slice(0, 20).map((event) => (
              <li key={event.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">
                    {formatUsageType(event.type)} x {event.quantity}
                  </p>
                  <p className="mt-1 break-words text-xs text-slate-600">{formatMetadata(event.metadata)}</p>
                </div>
                <time className="text-slate-600" dateTime={event.createdAt.toISOString()}>
                  {event.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No local usage events recorded.</li>
          )}
        </ul>
      </Panel>
    </main>
  );
}

function formatUsageType(type: UsageEventType) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMetadata(metadata: unknown) {
  if (!metadata) {
    return "metadata: none";
  }

  return `metadata: ${JSON.stringify(metadata)}`;
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
