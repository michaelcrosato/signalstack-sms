import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductDashboard, productDashboardActions, productNavigation } from "@/lib/product/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const dashboard = await getProductDashboard(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Product Dashboard</p>
              <h1 className="text-3xl font-semibold">SignalStack SMS</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Daily workspace for managing contacts, campaign readiness, inbox response, templates, analytics, and
                compliance in demo-safe mode.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {productDashboardActions.map((action) => (
                <Link
                  key={action.href}
                  className={
                    action.style === "primary"
                      ? "rounded border border-teal-700 px-3 py-2 font-medium text-teal-700"
                      : "rounded border border-slate-300 px-3 py-2 font-medium text-slate-700"
                  }
                  href={action.href}
                >
                  {action.label}
                </Link>
              ))}
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
        <section aria-label="Product metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} detail={metric.detail} />
          ))}
        </section>

        <ProductSection id="next-steps" title="Next Steps" eyebrow="Demo Path">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dashboard.nextSteps.map((step) => (
              <NextStep
                key={step.key}
                label={step.label}
                href={step.href}
                value={step.value}
                detail={step.detail}
              />
            ))}
          </div>
        </ProductSection>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {dashboard.sections.slice(0, 2).map((section) => (
            <ProductSection id={section.id} title={section.title} eyebrow={section.eyebrow} key={section.id}>
              <dl className="grid gap-3 text-sm">
                {section.rows.map((row) => (
                  <StatusRow key={row.key} label={row.label} value={row.value} />
                ))}
              </dl>
            </ProductSection>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {dashboard.sections.slice(2).map((section) => (
            <ProductSection id={section.id} title={section.title} eyebrow={section.eyebrow} key={section.id}>
              <dl className="grid gap-3 text-sm">
                {section.rows.map((row) => (
                  <StatusRow key={row.key} label={row.label} value={row.value} />
                ))}
              </dl>
            </ProductSection>
          ))}
        </section>

        <ProductSection id="analytics" title="Analytics" eyebrow="Local Signals">
          <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
            {dashboard.signals.map((signal) => (
              <StatusPill key={signal.key} label={signal.label} value={signal.value} />
            ))}
          </div>
        </ProductSection>
      </div>
    </main>
  );
}

function NextStep({ label, href, value, detail }: { label: string; href: string; value: string; detail: string }) {
  return (
    <Link className="rounded border border-slate-200 bg-slate-50 p-4 text-left" href={href}>
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <span className="mt-2 block text-lg font-semibold text-slate-950">{value}</span>
      <span className="mt-2 block text-sm leading-6 text-slate-600">{detail}</span>
    </Link>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function ProductSection({
  id,
  title,
  eyebrow,
  children
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
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

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
