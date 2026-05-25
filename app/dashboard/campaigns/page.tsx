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
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Campaigns</p>
              <h1 className="text-3xl font-semibold">Campaign workspace</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Compose a draft, choose opted-in recipients, run compliance preflight, and schedule a local queue job
                without provider sends.
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
        <section aria-label="Campaign metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">Composer</h2>
            <p className="mt-1 text-sm text-slate-600">Uses the existing campaign, preflight, and schedule APIs.</p>
            <div className="mt-5">
              <CampaignComposer contacts={contacts} templates={templates} />
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-semibold">Campaign status</h2>
              <p className="mt-1 text-sm text-slate-600">Local tenant campaigns and queue-ready state.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
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
                    <tr className="border-t border-slate-100" key={campaign.id}>
                      <td className="px-4 py-3">
                        <Link className="font-medium text-teal-700" href={`/dashboard/campaigns/${campaign.id}`}>
                          {campaign.name}
                        </Link>
                        <div className="text-slate-600">{campaign.templateName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold">
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{campaign.recipientCount}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium text-slate-950">
                          {campaign.readiness.readyRecipients}/{campaign.readiness.totalRecipients} ready
                        </div>
                        <div className="text-xs text-slate-600">{campaign.readiness.summaryLabel}</div>
                        {campaign.readiness.blockReasonLabels.length > 0 ? (
                          <div className="mt-1 text-xs text-amber-700">
                            {campaign.readiness.blockReasonLabels.join(" / ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium text-slate-950">{campaign.delivery.deliveryRatePercent}% delivered</div>
                        <div className="text-xs text-slate-600">
                          {campaign.delivery.delivered} delivered / {campaign.delivery.pending} pending / {campaign.delivery.failed} failed
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-700">{campaign.delivery.reviewStatus}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          Last evidence: {campaign.delivery.lastOutboundMessage}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
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
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
