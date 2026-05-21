import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getIntegrationOperationAreas } from "@/lib/operations/operator-surfaces";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

export default async function IntegrationOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const status = getSystemStatus(process.env);
  const integrationAreas = getIntegrationOperationAreas();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/provider">
          Provider Details
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/ai">
          AI Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/billing">
          Billing Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/notifications">
          Notification Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/workflows">
          Workflow Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/security">
          Security Operations
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Integration Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only integration boundary review for {currentOrg.orgName}. This page maps existing local integration
            surfaces without calling providers, submitting prompts, creating billing artifacts, sending notifications,
            exposing secrets, mutating records, or enabling live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
        <Metric label="Messaging" value={status.safety.messagingProvider} />
        <Metric label="AI" value={status.safety.aiProvider} />
        <Metric label="Billing live" value={String(status.safety.liveBillingEnabled)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Integration Surfaces">
          <ul className="grid gap-3 text-sm">
            {integrationAreas.map((area) => (
              <li key={area.href} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[180px_140px_1fr]">
                <Link className="font-semibold text-teal-700" href={area.href}>
                  {area.label}
                </Link>
                <span className="text-slate-600">{area.state}</span>
                <span className="text-slate-700">{area.boundary}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Runtime Gates">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Demo mode" value={String(status.safety.demoMode)} />
            <StatusRow label="Live messaging" value={String(status.safety.liveMessagingEnabled)} />
            <StatusRow label="Live billing" value={String(status.safety.liveBillingEnabled)} />
            <StatusRow label="Production override" value={String(status.deployment.productionExternalOverride)} />
            <StatusRow label="Redis configured" value={String(status.queue.redisConfigured)} />
          </dl>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>No provider APIs, live AI providers, Stripe APIs, notification services, Redis queues, or external webhooks are called.</li>
          <li>No credentials, token fingerprints, raw environment values, provider verification results, or secret-like data are displayed.</li>
          <li>No records are created, updated, deleted, exported, enqueued, replayed, charged, sent, or notified from this view.</li>
          <li>Future live integrations require explicit contracts, hard gates, tests, and demo-safe defaults before any external impact.</li>
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
