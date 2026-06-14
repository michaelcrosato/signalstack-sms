import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductCampaigns } from "@/lib/product/campaigns";
import { productNavigation } from "@/lib/product/dashboard";
import { CampaignComposer } from "./campaign-composer";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const { campaigns, contacts, metrics, templates } = await getProductCampaigns(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Campaigns</p>
              <h1 className="text-3xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Campaign workspace</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Compose a draft, choose opted-in recipients, run compliance preflight, and schedule a local queue job
                without provider sends.
              </p>
            </div>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition duration-200" href="/dashboard">
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
        <section aria-label="Campaign metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">Composer</h2>
            <p className="mt-1 text-xs text-slate-400">Uses the existing campaign, preflight, and schedule APIs.</p>
            <div className="mt-5">
              <CampaignComposer contacts={contacts} templates={templates} />
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="border-b border-white/5 p-5">
              <h2 className="text-xl font-bold font-display text-white">Campaign status</h2>
              <p className="mt-1 text-xs text-slate-400">Local tenant campaigns and queue-ready state.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300 font-display">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Recipients</th>
                    <th className="px-4 py-3">Readiness</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr className="border-t border-white/5 hover:bg-white/5 transition duration-150" key={campaign.id}>
                      <td className="px-4 py-3">
                        <Link className="font-semibold text-teal-400 hover:text-teal-300 transition duration-150" href={`/dashboard/campaigns/${campaign.id}`}>
                          {campaign.name}
                        </Link>
                        <div className="text-xs text-slate-400 mt-0.5">{campaign.templateName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-white/10 bg-slate-900/60 px-2 py-1 text-xs font-semibold text-slate-300">
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{campaign.recipientCount}</td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="font-semibold text-white">
                          {campaign.readiness.readyRecipients}/{campaign.readiness.totalRecipients} ready
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{campaign.readiness.summaryLabel}</div>
                        {campaign.readiness.blockReasonLabels.length > 0 ? (
                          <div className="mt-1.5 text-xs text-amber-400 font-medium">
                            {campaign.readiness.blockReasonLabels.join(" / ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="font-semibold text-white">{campaign.delivery.deliveryRatePercent}% delivered</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {campaign.delivery.delivered} delivered / {campaign.delivery.pending} pending / {campaign.delivery.failed} failed
                        </div>
                        <div className="mt-1.5 text-xs font-semibold text-slate-300">{campaign.delivery.reviewStatus}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          Last evidence: {campaign.delivery.lastOutboundMessage}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {campaign.scheduledAt ? campaign.scheduledAt.toLocaleString("en-US") : "Not scheduled"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-extrabold font-display text-white glow-text">{value}</p>
    </div>
  );
}
