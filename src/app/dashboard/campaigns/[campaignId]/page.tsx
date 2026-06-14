import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductCampaignDetail } from "@/lib/product/campaigns";
import { productNavigation } from "@/lib/product/dashboard";
import { CampaignDetailForm } from "./campaign-detail-form";

type CampaignDetailPageProps = {
  params: Promise<{ campaignId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  const [{ campaignId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const campaign = await getProductCampaignDetail(currentOrg.orgId, campaignId);

  if (!campaign) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Campaigns</p>
              <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">{campaign.name}</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Review campaign copy, edit draft recipients, and cancel queued local work without provider sends.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/dashboard/campaigns">
                Campaigns
              </Link>
              <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/dashboard">
                Dashboard
              </Link>
            </div>
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
        <section aria-label="Campaign lifecycle" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {campaign.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">Campaign detail</h2>
            <p className="mt-1.5 text-xs text-slate-400">Drafts can be edited. Scheduled campaigns can be canceled locally.</p>
            <div className="mt-5">
              <CampaignDetailForm campaign={campaign} />
            </div>
          </section>

          <section className="glass-card p-6">
            <div className="border-b border-white/5 pb-4">
              <h2 className="text-xl font-bold font-display text-white">Recipient snapshot</h2>
              <p className="mt-1.5 text-xs text-slate-400">Current campaign recipients and send eligibility signals.</p>
            </div>
            <div className="grid gap-4 mt-5">
              <section aria-label="Recipient readiness summary" className="grid gap-4 sm:grid-cols-2">
                {campaign.recipientReadinessMetrics.map((metric) => (
                  <Metric key={metric.key} label={metric.label} value={metric.value} />
                ))}
              </section>
              <p className="rounded-xl border border-white/5 bg-slate-900/30 p-4 text-xs text-slate-300">
                {campaign.recipientReadiness.summaryLabel}
              </p>
              {campaign.recipientRows.map((recipient) => (
                <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-4" key={recipient.id}>
                  <div className="font-bold text-white text-sm">{recipient.displayName}</div>
                  <div className="mt-1 text-xs text-slate-400">{recipient.phone}</div>
                  <dl className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
                    {recipient.statusRows.map((row) => (
                      <div className="rounded-lg border border-white/5 bg-slate-950 px-2.5 py-1" key={row.key}>
                        <dt className="inline text-slate-400">{row.label}: </dt>
                        <dd className="inline text-slate-200">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
              {campaign.recipientRows.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-slate-900/30 p-4 text-xs text-slate-400">
                  No recipients are attached to this campaign.
                </p>
              ) : null}
            </div>
          </section>
        </section>

        <section aria-label="Campaign delivery snapshot" className="glass-card p-6">
          <div className="border-b border-white/5 pb-4">
            <h2 className="text-xl font-bold font-display text-white">Delivery snapshot</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Metrics summarize all outbound local messages; recent rows show the latest 30 evidence records.
            </p>
          </div>
          <div className="grid gap-5 mt-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {campaign.deliveryMetrics.map((metric) => (
                <Metric key={metric.key} label={metric.label} value={metric.value} />
              ))}
            </div>

            <div className="grid gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-300">Recent outbound evidence</h3>
                <p className="mt-1 text-xs text-slate-400">
                  These rows are local ledger records only and do not trigger delivery retries or provider calls.
                </p>
              </div>
              {campaign.deliveryRows.length > 0 ? (
                campaign.deliveryRows.map((message) => (
                  <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-4" key={message.id}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-bold text-white text-sm">{message.contactDisplayName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {message.direction} / {message.deliveryState} / {message.providerStatus} / {message.providerMessageId}
                        </p>
                      </div>
                      <time className="text-[10px] text-slate-500 font-medium" dateTime={message.createdAt}>
                        {message.createdAt}
                      </time>
                    </div>
                    <dl className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
                      <div className="rounded-lg border border-white/5 bg-slate-950 px-2.5 py-1">
                        <dt className="inline text-slate-400">State: </dt>
                        <dd className="inline text-slate-200">{message.deliveryState}</dd>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-slate-950 px-2.5 py-1">
                        <dt className="inline text-slate-400">Delivered: </dt>
                        <dd className="inline text-slate-200">{message.deliveredAt ?? "not recorded"}</dd>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-slate-950 px-2.5 py-1">
                        <dt className="inline text-slate-400">Failed: </dt>
                        <dd className="inline text-slate-200">{message.failedAt ?? "not recorded"}</dd>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-slate-950 px-2.5 py-1">
                        <dt className="inline text-slate-400">Error Code: </dt>
                        <dd className="inline text-slate-200">{message.providerErrorCode}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-white/5 bg-slate-900/30 p-4 text-xs text-slate-400">
                  No local delivery messages recorded for this campaign.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="glass-card p-6">
          <h2 className="text-xl font-bold font-display text-white">Safety Boundary</h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            This page only reads and mutates local campaign records through existing APIs. It does not send SMS, call
            providers, run workers, create billing records, call live AI, expose secrets, or enable live messaging.
          </p>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-3 break-words text-xl font-bold font-display text-white glow-text">{value}</p>
    </div>
  );
}
