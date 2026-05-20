import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

const securityControls = [
  {
    name: "Secret storage",
    status: "local metadata only",
    detail: "Provider credential screens store redacted metadata and token fingerprints only."
  },
  {
    name: "External impact",
    status: "blocked by default",
    detail: "Live SMS, billing, notifications, provider calls, and live AI remain disabled by demo-safe defaults."
  },
  {
    name: "API protection",
    status: "rate limited",
    detail: "Next middleware applies the local fixed-window policy to /api/:path*."
  },
  {
    name: "Production gate",
    status: "validation enforced",
    detail: "npm run validate includes the production deployment gate and blocks unsafe live-impact production-like settings."
  }
];

export default async function SecurityOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const status = getSystemStatus(process.env);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/system">
          System Status
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/api">
          API Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contracts">
          Contract Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/notifications">
          Notification Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/validation">
          Validation Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Security Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only safety and security control review for {currentOrg.orgName}. This page displays local gate
            status and documented boundaries only; it does not scan files, reveal environment values, mutate records,
            call providers, create billing records, send notifications, or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Demo mode" value={String(status.safety.demoMode)} />
        <Metric label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
        <Metric label="API policy" value={status.apiRateLimit.enabled ? "enabled" : "disabled"} />
        <Metric label="Production override" value={String(status.deployment.productionExternalOverride)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Safety Gates">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Live messaging" value={String(status.safety.liveMessagingEnabled)} />
            <StatusRow label="Live billing" value={String(status.safety.liveBillingEnabled)} />
            <StatusRow label="Messaging provider" value={status.safety.messagingProvider} />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
          </dl>
        </Panel>

        <Panel title="Runtime Controls">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="NODE_ENV" value={status.deployment.nodeEnv} />
            <StatusRow label="VERCEL_ENV" value={status.deployment.vercelEnv} />
            <StatusRow label="APP_ENV" value={status.deployment.appEnv} />
            <StatusRow label="API limit" value={`${status.apiRateLimit.limit}/${status.apiRateLimit.windowSeconds}s`} />
          </dl>
        </Panel>
      </section>

      <Panel title="Control Inventory">
        <ul className="grid gap-3 text-sm">
          {securityControls.map((control) => (
            <li key={control.name} className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[12rem_10rem_1fr]">
              <span className="font-medium text-slate-950">{control.name}</span>
              <span className="text-slate-700">{control.status}</span>
              <span className="text-slate-600">{control.detail}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>This view does not read or display raw secrets, `.env.local`, provider tokens, or API keys.</li>
          <li>Secret scanning remains an explicit validation command through `npm run secrets:scan`.</li>
          <li>Production safety remains enforced through `npm run production:gate` inside `npm run validate`.</li>
          <li>No provider calls, live AI calls, Stripe calls, SMS, email, notifications, mutations, or live feature enablement occur here.</li>
        </ul>
      </Panel>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-950">{value}</dd>
    </div>
  );
}
