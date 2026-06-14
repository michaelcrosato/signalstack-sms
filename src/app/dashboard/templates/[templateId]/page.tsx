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

export default async function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const [{ templateId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const template = await getProductTemplateDetail(currentOrg.orgId, templateId);

  if (!template) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Templates</p>
              <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">{template.name}</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Edit reusable local SMS copy and variable placeholders without rendering live outbound messages.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/dashboard/templates">
                Templates
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
        <section aria-label="Template lifecycle" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {template.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">Template detail</h2>
            <p className="mt-1.5 text-xs text-slate-400">Edits update the tenant-scoped local template row.</p>
            <div className="mt-5">
              <TemplateDetailForm template={template} />
            </div>
          </section>

          <section className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">Usage snapshot</h2>
            <dl className="mt-4 grid gap-3.5 text-sm">
              <div className="rounded-2xl border border-white/5 bg-slate-900/30 p-4">
                <dt className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">Campaigns using this template</dt>
                <dd className="mt-2 text-slate-200 text-sm font-semibold">{template.campaignUsage}</dd>
              </div>
              <div className="rounded-2xl border border-white/5 bg-slate-900/30 p-4">
                <dt className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">Variable names</dt>
                <dd className="mt-2 text-slate-200 text-sm font-mono text-[11px]">{template.variables.length > 0 ? template.variables.join(", ") : "none"}</dd>
              </div>
            </dl>
          </section>
        </section>

        <section className="glass-card p-6">
          <h2 className="text-xl font-bold font-display text-white">Safety Boundary</h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            This page only reads and updates local template records. It does not render live outbound messages, schedule
            campaigns, send SMS, call providers, create billing records, call live AI, expose secrets, or enable live messaging.
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
