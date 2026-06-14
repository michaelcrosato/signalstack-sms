import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductDashboard, productDashboardActions, productNavigation } from "@/lib/product/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const dashboard = await getProductDashboard(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Product Dashboard</p>
              <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">SignalStack SMS</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Daily workspace for managing contacts, campaign readiness, inbox response, templates, analytics, and
                compliance in demo-safe mode.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {productDashboardActions.map((action) => (
                <Link
                  key={action.href}
                  className={
                    action.style === "primary"
                      ? "rounded-xl border border-teal-500 bg-teal-500/10 px-4 py-2 font-medium text-teal-300 hover:bg-teal-500/20 transition duration-200 shadow-[0_0_15px_rgba(20,184,166,0.1)]"
                      : "rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10 transition duration-200"
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
        <section aria-label="Product metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} detail={metric.detail} />
          ))}
        </section>

        <ProductSection id="next-steps" title="Next Steps" eyebrow="Demo Path">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <dl className="grid gap-3.5 text-sm">
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
              <dl className="grid gap-3.5 text-sm">
                {section.rows.map((row) => (
                  <StatusRow key={row.key} label={row.label} value={row.value} />
                ))}
              </dl>
            </ProductSection>
          ))}
        </section>

        <ProductSection id="analytics" title="Analytics" eyebrow="Local Signals">
          <div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
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
    <Link className="glass-card p-5 text-left flex flex-col justify-between group hover:border-indigo-500/40" href={href}>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-widest text-slate-400 group-hover:text-indigo-300 transition duration-200">{label}</span>
        <span className="mt-3 block text-2xl font-bold font-display text-white group-hover:text-indigo-200 transition duration-200">{value}</span>
      </div>
      <span className="mt-4 block text-xs leading-5 text-slate-400 group-hover:text-slate-300 transition duration-200">{detail}</span>
    </Link>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="glass-card p-5 flex flex-col justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="mt-3 text-4xl font-extrabold font-display text-white glow-text">{value}</p>
      </div>
      <p className="mt-4 text-xs text-slate-400 border-t border-white/5 pt-3">{detail}</p>
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
    <section id={id} className="glass-card p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-400 font-display">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold font-display text-white">{title}</h2>
      <div className="mt-5">{children}</div>
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

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/30 p-4 hover:border-white/10 transition duration-200">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-bold font-display text-white">{value}</p>
    </div>
  );
}
