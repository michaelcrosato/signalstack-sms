import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { productNavigation } from "@/lib/product/dashboard";
import { getProductTemplateDetail } from "@/lib/product/templates";
import { TemplateDetailForm } from "./template-detail-form";

type TemplateDetailPageProps = {
  params: Promise<{ templateId: string }>;
};

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: TemplateDetailPageProps) {
  const [{ templateId }, currentOrg] = await Promise.all([
    params,
    getOrCreateCurrentOrg(),
  ]);
  const template = await getProductTemplateDetail(currentOrg.orgId, templateId);

  if (!template) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
                Templates
              </p>
              <h1 className="text-3xl font-semibold">{template.name}</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Edit reusable local SMS copy and variable placeholders without
                rendering live outbound messages.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                href="/dashboard/templates"
              >
                Templates
              </Link>
              <Link
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                href="/dashboard"
              >
                Dashboard
              </Link>
            </div>
          </div>
          <nav
            aria-label="Product areas"
            className="flex gap-2 overflow-x-auto pb-1"
          >
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
        <section
          aria-label="Template lifecycle"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {template.metrics.map((metric) => (
            <Metric
              key={metric.key}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">Template detail</h2>
            <p className="mt-1 text-sm text-slate-600">
              Edits update the tenant-scoped local template row.
            </p>
            <div className="mt-5">
              <TemplateDetailForm template={template} />
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">Usage snapshot</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-950">
                  Campaigns using this template
                </dt>
                <dd className="mt-1 text-slate-700">
                  {template.campaignUsage}
                </dd>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-950">Variable names</dt>
                <dd className="mt-1 text-slate-700">
                  {template.variables.length > 0
                    ? template.variables.join(", ")
                    : "none"}
                </dd>
              </div>
            </dl>
          </section>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold">Safety Boundary</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This page only reads and updates local template records. It does not
            render live outbound messages, schedule campaigns, send SMS, call
            providers, create billing records, call live AI, expose secrets, or
            enable live messaging.
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
