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
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Compliance</p>
              <h1 className="text-3xl font-semibold">Readiness workspace</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Review the profile fields, A2P status, and runtime hard-gate blockers that keep campaign sending
                demo-safe until explicit go-live work is complete.
              </p>
            </div>
            <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" href="/settings/compliance">
              Compliance Settings
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
        <section aria-label="Compliance metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {compliance.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} detail={metric.detail} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Profile Checklist">
            <ul className="grid gap-3">
              {compliance.fields.map((field) => (
                <li className="grid gap-1 border-b border-slate-100 pb-3" key={field.key}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-slate-950">{field.label}</span>
                    <span className={field.complete ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-amber-700"}>
                      {field.status}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">{field.guidance}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Runtime Gates">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Demo mode" value={String(compliance.summary.demoMode)} />
              <StatusRow label="Live messaging flag" value={String(compliance.summary.liveMessagingEnabled)} />
              <StatusRow label="Messaging provider" value={compliance.summary.messagingProvider} />
              <StatusRow label="Live messaging allowed" value={String(compliance.summary.liveMessagingAllowed)} />
              <StatusRow label="Updated" value={compliance.profile.updatedAt.toLocaleString("en-US")} />
            </dl>
          </Panel>
        </section>

        <Panel title="Hard-Gate Blockers">
          <ul className="grid gap-3 text-sm">
            {compliance.blockers.length > 0 ? (
              compliance.blockers.map((blocker) => (
                <li className="rounded border border-slate-200 bg-slate-50 p-3" key={blocker.reason}>
                  <p className="font-semibold text-slate-950">{blocker.reason}</p>
                  <p className="mt-1 text-slate-700">{blocker.description}</p>
                </li>
              ))
            ) : (
              <li className="text-slate-700">No hard-gate blockers recorded.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Safety Boundary">
          <ul className="grid gap-2 text-sm text-slate-700">
            <li>This workspace reads local compliance readiness and runtime gate state.</li>
            <li>It does not register A2P campaigns, call providers, send SMS, create billing records, or enable live flags.</li>
            <li>Go-live remains controlled by protected validation gates and explicit production readiness work.</li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
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
