import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductAnalytics } from "@/lib/product/analytics";
import { productNavigation } from "@/lib/product/dashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const analytics = await getProductAnalytics(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Analytics</p>
              <h1 className="text-3xl font-semibold">Analytics workspace</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Review local audience, campaign, inbox, and usage signals from the existing analytics overview without
                provider calls, exports, billing actions, or live feature enablement.
              </p>
            </div>
            <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" href="/dashboard">
              Dashboard
            </Link>
          </div>
          <nav aria-label="Product areas" className="flex gap-2 overflow-x-auto pb-1">
            {productNavigation.map((item) => (
              <Link
                key={item.href}
                className="min-w-fit rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6">
        <section aria-label="Analytics metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Consent Coverage" value={`${analytics.derived.consentCoveragePercent}%`} detail={`${analytics.contacts.optedIn}/${analytics.contacts.total} opted in`} />
          <Metric label="Campaigns" value={analytics.campaigns.total} detail="local campaign records" />
          <Metric label="Inbox Load" value={analytics.conversations.open} detail={`${analytics.messages.total} local messages`} />
          <Metric label="Usage Events" value={analytics.derived.totalUsageEvents} detail="local metering only" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Panel title="Audience Signals">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Active contacts" value={String(analytics.contacts.total)} />
              <StatusRow label="Opted in" value={String(analytics.contacts.optedIn)} />
              <StatusRow label="Opted out" value={String(analytics.contacts.optedOut)} />
              <StatusRow label="Opt-out share" value={`${analytics.derived.optedOutPercent}%`} />
            </dl>
          </Panel>

          <Panel title="Inbox Signals">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Total conversations" value={String(analytics.conversations.total)} />
              <StatusRow label="Open conversations" value={String(analytics.conversations.open)} />
              <StatusRow label="Resolved conversations" value={String(analytics.conversations.resolved)} />
              <StatusRow label="Resolution rate" value={`${analytics.derived.resolvedConversationPercent}%`} />
              <StatusRow label="Average messages per conversation" value={String(analytics.derived.averageMessagesPerConversation)} />
            </dl>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Panel title="Campaign Signals">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Campaign records" value={String(analytics.campaigns.total)} />
              <StatusRow label="Scheduled campaigns" value={String(analytics.campaigns.scheduled)} />
              <StatusRow label="Scheduled rate" value={`${analytics.derived.scheduledCampaignPercent}%`} />
              <StatusRow label="Fake AI usage share" value={`${analytics.derived.fakeAiUsagePercent}%`} />
              <StatusRow label="Scheduled work source" value="local queue records" />
              <StatusRow label="Provider sends" value="disabled" />
              <StatusRow label="Live messaging" value="blocked" />
            </dl>
          </Panel>

          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-semibold">Usage Metering</h2>
              <p className="mt-1 text-sm text-slate-600">Tenant-scoped local usage totals from the analytics overview.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Signal</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.usageRows.map((row) => (
                    <tr className="border-t border-slate-100" key={row.type}>
                      <td className="px-4 py-3 font-medium text-slate-950">{row.label}</td>
                      <td className="px-4 py-3 text-slate-700">{row.type}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <Panel title="Safety Boundary">
          <ul className="grid gap-2 text-sm text-slate-700">
            <li>This workspace reads tenant-scoped local analytics and usage totals only.</li>
            <li>It does not execute reports, create exports, mutate records, call providers, call Stripe, or send SMS.</li>
            <li>Live messaging, live billing, live AI, notifications, secrets, and provider traffic remain blocked here.</li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
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
