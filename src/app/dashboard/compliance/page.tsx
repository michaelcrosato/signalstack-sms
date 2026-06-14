import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductCompliance } from "@/lib/product/compliance";
import { productNavigation } from "@/lib/product/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardCompliancePage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const compliance = await getProductCompliance({
    orgId: currentOrg.orgId,
    demoMode: currentOrg.demoMode
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Compliance</p>
              <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Readiness workspace</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Review the profile fields, A2P status, and runtime hard-gate blockers that keep campaign sending
                demo-safe until explicit go-live work is complete.
              </p>
            </div>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/settings/compliance">
              Compliance Settings
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
        <section aria-label="Compliance metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {compliance.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} detail={metric.detail} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Profile Checklist">
            <ul className="grid gap-4">
              {compliance.fields.map((field) => (
                <li className="grid gap-1 border-b border-white/5 pb-3.5" key={field.key}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-bold text-white text-sm">{field.label}</span>
                    <span className={field.complete ? "text-xs font-bold text-emerald-400" : "text-xs font-bold text-amber-400"}>
                      {field.status}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-slate-400 mt-1">{field.guidance}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Runtime Gates">
            <dl className="grid gap-3.5 text-sm">
              <StatusRow label="Demo mode" value={String(compliance.summary.demoMode)} />
              <StatusRow label="Live messaging flag" value={String(compliance.summary.liveMessagingEnabled)} />
              <StatusRow label="Messaging provider" value={compliance.summary.messagingProvider} />
              <StatusRow label="Live messaging allowed" value={String(compliance.summary.liveMessagingAllowed)} />
              <StatusRow label="Updated" value={compliance.profile.updatedAt.toLocaleString("en-US")} />
            </dl>
          </Panel>
        </section>

        <Panel title="Hard-Gate Blockers">
          <ul className="grid gap-3 text-xs">
            {compliance.blockers.length > 0 ? (
              compliance.blockers.map((blocker) => (
                <li className="rounded-2xl border border-white/5 bg-slate-900/30 p-4" key={blocker.reason}>
                  <p className="font-bold text-white">{blocker.reason}</p>
                  <p className="mt-1.5 text-slate-300 leading-5">{blocker.description}</p>
                </li>
              ))
            ) : (
              <li className="text-slate-400">No hard-gate blockers recorded.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Safety Boundary">
          <ul className="grid gap-3 text-xs text-slate-400 leading-5">
            <li className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5">▪</span>
              <span>This workspace reads local compliance readiness and runtime gate state.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5">▪</span>
              <span>It does not register A2P campaigns, call providers, send SMS, create billing records, or enable live flags.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5">▪</span>
              <span>Go-live remains controlled by protected validation gates and explicit production readiness work.</span>
            </li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
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
