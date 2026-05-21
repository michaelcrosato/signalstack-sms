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
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Campaigns</p>
              <h1 className="text-3xl font-semibold">{campaign.name}</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Review campaign copy, edit draft recipients, and cancel queued local work without provider sends.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" href="/dashboard/campaigns">
                Campaigns
              </Link>
              <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" href="/dashboard">
                Dashboard
              </Link>
            </div>
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
        <section aria-label="Campaign lifecycle" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Status" value={campaign.status} />
          <Metric label="Recipients" value={campaign.recipientRows.length.toString()} />
          <Metric label="Template" value={campaign.templateName} />
          <Metric
            label="Schedule"
            value={campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString("en-US") : "Not scheduled"}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">Campaign detail</h2>
            <p className="mt-1 text-sm text-slate-600">Drafts can be edited. Scheduled campaigns can be canceled locally.</p>
            <div className="mt-5">
              <CampaignDetailForm campaign={campaign} />
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-semibold">Recipient snapshot</h2>
              <p className="mt-1 text-sm text-slate-600">Current campaign recipients and send eligibility signals.</p>
            </div>
            <div className="grid gap-3 p-5">
              {campaign.recipientRows.map((recipient) => (
                <article className="rounded border border-slate-200 bg-slate-50 p-3" key={recipient.id}>
                  <div className="font-medium text-slate-950">{recipient.displayName}</div>
                  <div className="mt-1 text-sm text-slate-600">{recipient.phone}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded border border-slate-300 bg-white px-2 py-1">{recipient.consentStatus}</span>
                    <span className="rounded border border-slate-300 bg-white px-2 py-1">
                      {recipient.archived ? "archived" : "active"}
                    </span>
                  </div>
                </article>
              ))}
              {campaign.recipientRows.length === 0 ? (
                <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No recipients are attached to this campaign.
                </p>
              ) : null}
            </div>
          </section>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold">Safety Boundary</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
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
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold">{value}</p>
    </div>
  );
}
