import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

export default async function SystemStatusPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const status = getSystemStatus(process.env);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/compliance">
          Compliance Detail
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/usage">
          Usage & Analytics
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">System Status</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only operations snapshot for {currentOrg.orgName}. This page displays local configuration and does not mutate records,
            call providers, send notifications, create billing events, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Demo mode" value={String(status.safety.demoMode)} />
        <Metric label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
        <Metric label="Queue backend" value={status.queue.backend} />
        <Metric label="API limit" value={`${status.apiRateLimit.limit}/${status.apiRateLimit.windowSeconds}s`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Safety Defaults">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Live messaging" value={String(status.safety.liveMessagingEnabled)} />
            <StatusRow label="Live billing" value={String(status.safety.liveBillingEnabled)} />
            <StatusRow label="Messaging provider" value={status.safety.messagingProvider} />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
          </dl>
        </Panel>

        <Panel title="Runtime">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="NODE_ENV" value={status.deployment.nodeEnv} />
            <StatusRow label="VERCEL_ENV" value={status.deployment.vercelEnv} />
            <StatusRow label="APP_ENV" value={status.deployment.appEnv} />
            <StatusRow label="Production override" value={String(status.deployment.productionExternalOverride)} />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Queue">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Backend" value={status.queue.backend} />
            <StatusRow label="Redis configured" value={String(status.queue.redisConfigured)} />
            <StatusRow label="Jobs per poll" value={String(status.queue.workerMaxJobsPerPoll)} />
          </dl>
        </Panel>

        <Panel title="API Protection">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Rate limit enabled" value={String(status.apiRateLimit.enabled)} />
            <StatusRow label="Requests" value={String(status.apiRateLimit.limit)} />
            <StatusRow label="Window seconds" value={String(status.apiRateLimit.windowSeconds)} />
          </dl>
        </Panel>
      </section>
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
