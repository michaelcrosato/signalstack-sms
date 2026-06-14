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
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Analytics</p>
              <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Analytics workspace</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Review local audience, campaign, inbox, and usage signals from the existing analytics overview without
                provider calls, exports, billing actions, or live feature enablement.
              </p>
            </div>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/dashboard">
              Dashboard
            </Link>
          </div>
          <nav aria-label="Product areas" className="flex gap-2 overflow-x-auto pb-1">
            {productNavigation.map((item) => (
              <Link
                key={item.href}
                className="min-w-fit rounded-lg border border-white/5 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition duration-200"
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6">
        <section aria-label="Analytics metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {analytics.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} detail={metric.detail} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Panel title="Audience Signals">
            <dl className="grid gap-3.5 text-sm">
              <StatusRow label="Active contacts" value={String(analytics.contacts.total)} />
              <StatusRow label="Opted in" value={String(analytics.contacts.optedIn)} />
              <StatusRow label="Opted out" value={String(analytics.contacts.optedOut)} />
              <StatusRow label="Opt-out share" value={`${analytics.derived.optedOutPercent}%`} />
            </dl>
          </Panel>

          <Panel title="Inbox Signals">
            <dl className="grid gap-3.5 text-sm">
              <StatusRow label="Total conversations" value={String(analytics.conversations.total)} />
              <StatusRow label="Open conversations" value={String(analytics.conversations.open)} />
              <StatusRow label="Resolved conversations" value={String(analytics.conversations.resolved)} />
              <StatusRow label="Resolution rate" value={`${analytics.derived.resolvedConversationPercent}%`} />
              <StatusRow label="Average messages per conversation" value={String(analytics.derived.averageMessagesPerConversation)} />
            </dl>
          </Panel>

          <Panel title="Delivery Signals">
            <dl className="grid gap-3.5 text-sm">
              {analytics.deliveryRows.map((row) => (
                <StatusRow key={row.key} label={row.label} value={row.value} />
              ))}
              <StatusRow label="Inbound messages" value={String(analytics.messages.inbound)} />
              <StatusRow label="Delivery source" value="local message rows" />
            </dl>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Panel title="Campaign Signals">
            <dl className="grid gap-3.5 text-sm">
              <StatusRow label="Campaign records" value={String(analytics.campaigns.total)} />
              <StatusRow label="Scheduled campaigns" value={String(analytics.campaigns.scheduled)} />
              <StatusRow label="Scheduled rate" value={`${analytics.derived.scheduledCampaignPercent}%`} />
              <StatusRow label="Fake AI usage share" value={`${analytics.derived.fakeAiUsagePercent}%`} />
              <StatusRow label="Scheduled work source" value="local queue records" />
              <StatusRow label="Provider sends" value="disabled" />
              <StatusRow label="Live messaging" value="blocked" />
            </dl>
          </Panel>

          <section className="glass-card p-6">
            <div className="border-b border-white/5 pb-4">
              <h2 className="text-xl font-bold font-display text-white">Usage Metering</h2>
              <p className="mt-1.5 text-xs text-slate-400">Tenant-scoped local usage totals from the analytics overview.</p>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                <thead className="border-b border-white/5 text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Signal</th>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3.5 text-right font-semibold uppercase tracking-wider">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.usageRows.map((row) => (
                    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition duration-150" key={row.type}>
                      <td className="px-4 py-4 font-bold text-white">{row.label}</td>
                      <td className="px-4 py-4 text-slate-400">{row.type}</td>
                      <td className="px-4 py-4 text-right text-slate-300 font-semibold">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section aria-label="Campaign delivery review queue" className="glass-card p-6">
          <div className="border-b border-white/5 pb-4">
            <h2 className="text-xl font-bold font-display text-white">Delivery Review Queue</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Campaign-level local delivery evidence, ordered by failed and pending review states before delivered or
              no-evidence campaigns.
            </p>
            <dl aria-label="Delivery review queue summary" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <QueueSummaryMetric label="Campaigns" value={String(analytics.campaignDeliverySummary.totalCampaigns)} />
              <QueueSummaryMetric
                label="Need Review"
                value={String(analytics.campaignDeliverySummary.campaignsNeedingReview)}
              />
              <QueueSummaryMetric label="Failed" value={String(analytics.campaignDeliverySummary.failedCampaigns)} />
              <QueueSummaryMetric label="Pending" value={String(analytics.campaignDeliverySummary.pendingCampaigns)} />
              <QueueSummaryMetric
                label="Visible Rows"
                value={`${analytics.campaignDeliverySummary.visibleRows}/${analytics.campaignDeliverySummary.totalCampaigns}`}
              />
              <QueueSummaryMetric label="Hidden Rows" value={String(analytics.campaignDeliverySummary.hiddenRows)} />
            </dl>
          </div>
          {analytics.campaignDeliveryRows.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead className="border-b border-white/5 text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Campaign</th>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Review</th>
                    <th className="px-4 py-3.5 text-right font-semibold uppercase tracking-wider">Outbound</th>
                    <th className="px-4 py-3.5 text-right font-semibold uppercase tracking-wider">Rate</th>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Last evidence</th>
                    <th className="px-4 py-3.5 text-right font-semibold uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.campaignDeliveryRows.map((campaign) => (
                    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition duration-150" key={campaign.id}>
                      <td className="px-4 py-4">
                        <div className="font-bold text-white">{campaign.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{campaign.status}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-200">{campaign.reviewStatus}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {campaign.delivered} delivered / {campaign.pending} pending / {campaign.failed} failed
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-slate-300 font-semibold">{campaign.outboundMessages}</td>
                      <td className="px-4 py-4 text-right text-slate-300 font-semibold">{campaign.deliveryRatePercent}%</td>
                      <td className="px-4 py-4 text-slate-400 text-[11px] font-mono">{campaign.lastOutboundMessage}</td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          aria-label={`Review evidence for ${campaign.name}`}
                          className="font-bold text-teal-400 hover:text-teal-300 transition"
                          href={campaign.href}
                        >
                          Review evidence
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-xs text-slate-400">No campaign records are available for delivery review.</p>
          )}
        </section>

        <Panel title="Safety Boundary">
          <ul className="grid gap-3 text-xs text-slate-400 leading-5">
            <li className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5">▪</span>
              <span>This workspace reads tenant-scoped local analytics and usage totals only.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5">▪</span>
              <span>It does not execute reports, create exports, mutate records, call providers, call Stripe, or send SMS.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5">▪</span>
              <span>Live messaging, live billing, live AI, notifications, secrets, and provider traffic remain blocked here.</span>
            </li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-extrabold font-display text-white glow-text">{value}</p>
      <p className="mt-1.5 text-xs text-slate-400 border-t border-white/5 pt-2">{detail}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-card p-6">
      <h2 className="text-xl font-bold font-display text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2.5">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-200">{value}</dd>
    </div>
  );
}

function QueueSummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/30 px-3.5 py-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1.5 text-lg font-bold font-display text-white">{value}</dd>
    </div>
  );
}
