import Link from "next/link";
import type { ReactNode } from "react";
import { envDefaults } from "@/lib/env/defaults";
import { getEnvironmentOperationLinks } from "@/lib/operations/operator-surfaces";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

const configurationGroups = [
  {
    name: "External-impact gates",
    keys: ["DEMO_MODE", "LIVE_MESSAGING_ENABLED", "LIVE_BILLING_ENABLED", "ALLOW_PRODUCTION_EXTERNALS"],
    note: "Controls whether live SMS, billing, provider, and production override paths stay blocked."
  },
  {
    name: "Provider selection",
    keys: ["MESSAGING_PROVIDER", "AI_PROVIDER", "QUEUE_BACKEND"],
    note: "Selects local dummy/fake providers and optional queue backend behavior."
  },
  {
    name: "Local worker bounds",
    keys: ["WORKER_MAX_JOBS_PER_POLL", "WORKER_MAX_ITERATIONS", "WORKER_POLL_INTERVAL_MS"],
    note: "Limits unattended local worker polling without changing durable queued jobs."
  },
  {
    name: "API protection",
    keys: ["API_RATE_LIMIT_ENABLED", "API_RATE_LIMIT_MAX", "API_RATE_LIMIT_WINDOW_MS"],
    note: "Configures the in-memory API rate limiter for local/demo traffic."
  },
  {
    name: "Deployment markers",
    keys: ["NODE_ENV", "VERCEL_ENV", "APP_ENV", "DEPLOYMENT_ENV"],
    note: "Marks local versus production-like runtime for hard-gate checks."
  }
];

export default function EnvironmentOperationsPage() {
  const status = getSystemStatus(process.env);
  const operationLinks = getEnvironmentOperationLinks();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          {operationLinks.map((link) => (
            <Link key={link.href} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Environment Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local configuration checkpoint for demo-safe defaults, runtime categories, and environment boundary
            status. This page displays allowlisted names and derived statuses only; it does not read `.env.local`, expose
            raw secrets, mutate records, call providers, bill, notify, send SMS or email, or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Demo mode" value={String(status.safety.demoMode)} />
        <Metric label="Live messaging" value={String(status.safety.liveMessagingEnabled)} />
        <Metric label="Live billing" value={String(status.safety.liveBillingEnabled)} />
        <Metric label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Demo-Safe Defaults">
          <dl className="grid gap-3 text-sm">
            {Object.entries(envDefaults).map(([key, value]) => (
              <StatusRow key={key} label={key} value={value} />
            ))}
          </dl>
        </Panel>

        <Panel title="Derived Runtime Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Messaging provider" value={status.safety.messagingProvider} />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
            <StatusRow label="Queue backend" value={status.queue.backend} />
            <StatusRow label="Redis configured" value={String(status.queue.redisConfigured)} />
            <StatusRow label="Production override" value={String(status.deployment.productionExternalOverride)} />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Configuration Categories">
          <ul className="grid gap-3 text-sm">
            {configurationGroups.map((group) => (
              <li key={group.name} className="rounded border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-950">{group.name}</h3>
                <p className="mt-2 text-slate-600">{group.note}</p>
                <p className="mt-3 break-words font-mono text-xs text-slate-700">{group.keys.join(", ")}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Operational Links">
          <ul className="grid gap-3 text-sm">
            {operationLinks.map((link) => (
              <OperationLink key={link.href} href={link.href} label={link.label} note={link.note} />
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>No environment files, `.env.local` contents, raw variable values, provider tokens, fingerprints, logs, diffs, or secret-like values are displayed.</li>
          <li>No configuration is created, updated, deleted, exported, validated with a provider, deployed, or written to disk from this view.</li>
          <li>No commands, scripts, migrations, tests, browser sessions, git operations, API probes, Redis calls, or provider calls are executed.</li>
          <li>No SMS, email, notifications, live AI requests, Stripe calls, billing records, outbound webhooks, or live feature flags are triggered.</li>
        </ul>
      </Panel>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function OperationLink({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <li className="rounded border border-slate-200 p-4">
      <Link className="font-semibold text-teal-700" href={href}>
        {label}
      </Link>
      <p className="mt-2 text-slate-600">{note}</p>
    </li>
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
      <dd className="break-words text-right font-medium text-slate-950">{value}</dd>
    </div>
  );
}


