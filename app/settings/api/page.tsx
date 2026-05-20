import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getApiOperationsStatus } from "@/lib/operations/api-operations";

export const dynamic = "force-dynamic";

export default async function ApiOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const status = getApiOperationsStatus(process.env);
  const areas = Array.from(new Set(status.routes.map((route) => route.area))).sort();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
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
        <Link className="text-sm font-medium text-teal-700" href="/settings/security">
          Security Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contracts">
          Contract Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">API Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only API surface review for {currentOrg.orgName}. This page displays local route inventory,
            mutation boundaries, and rate-limit policy only; it does not call APIs, mutate records, call providers,
            create billing records, send notifications, expose secrets, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Routes" value={String(status.routeCount)} />
        <Metric label="Mutating routes" value={String(status.mutatingRouteCount)} />
        <Metric label="External impact routes" value={String(status.externalImpactRouteCount)} />
        <Metric label="Rate limit" value={`${status.rateLimit.limit}/${status.rateLimit.windowSeconds}s`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Rate Limit Policy">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Enabled" value={String(status.rateLimit.enabled)} />
            <StatusRow label="Requests" value={String(status.rateLimit.limit)} />
            <StatusRow label="Window seconds" value={String(status.rateLimit.windowSeconds)} />
            <StatusRow label="Middleware matcher" value="/api/:path*" />
          </dl>
        </Panel>

        <Panel title="Route Areas">
          <dl className="grid gap-3 text-sm">
            {areas.map((area) => (
              <StatusRow key={area} label={area} value={String(status.routes.filter((route) => route.area === area).length)} />
            ))}
          </dl>
        </Panel>
      </section>

      <Panel title="Route Inventory">
        <ul className="grid gap-3 text-sm">
          {status.routes.map((route) => (
            <li key={`${route.method}:${route.path}`} className="grid gap-2 border-b border-slate-100 pb-3 lg:grid-cols-[7rem_1fr_8rem_8rem]">
              <span className="font-mono text-xs font-semibold text-slate-950">{route.method}</span>
              <span className="break-words font-mono text-xs text-slate-800">{route.path}</span>
              <span className="text-slate-600">{route.area}</span>
              <span className={route.mutates ? "font-medium text-amber-700" : "font-medium text-teal-700"}>
                {route.mutates ? "local write" : "read only"}
              </span>
              <span className="lg:col-start-2 lg:col-span-3 text-xs text-slate-600">{route.safety}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>The inventory is static local metadata and does not execute any API handler.</li>
          <li>External impact routes must remain zero until future live SMS, billing, notification, and AI gates are designed and tested.</li>
          <li>Mutating routes listed here are local database/demo operations and stay behind existing tenant, compliance, provider, and billing gates.</li>
          <li>No provider calls, live SMS, live AI, Stripe calls, notifications, secrets, or production-destructive operations are introduced by this view.</li>
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
