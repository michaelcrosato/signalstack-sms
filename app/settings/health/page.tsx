import { SettingsLink } from "@/components/settings/SettingsLink";
import Link from "next/link";
import type { ReactNode } from "react";
import { envDefaults } from "@/lib/env/defaults";
import { getHealthOperationLinks } from "@/lib/operations/operator-surfaces";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

const healthSignals = [
  {
    name: "Service",
    value: "signalstack-sms",
    note: "Static service identifier returned by the local health endpoint.",
  },
  {
    name: "Health endpoint",
    value: "GET /api/health",
    note: "Read-only route that reports ok state and demo-safe defaults.",
  },
  {
    name: "External impact",
    value: "blocked",
    note: "Health review does not execute route handlers, mutate data, call providers, bill, notify, or send.",
  },
];

export default function HealthOperationsPage() {
  const status = getSystemStatus(process.env);
  const operationLinks = getHealthOperationLinks();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          {operationLinks.map((link) => (
            <SettingsLink key={link.href} href={link.href}>
              {link.label}
            </SettingsLink>
          ))}
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">
            Settings
          </p>
          <h1 className="text-4xl font-semibold text-slate-950">
            Health Operations
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local health checkpoint for demo-safe defaults, runtime
            blockers, and the existing health endpoint. This page does not
            execute checks, call APIs, mutate records, expose secrets, call
            providers, bill, notify, send SMS or email, or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Service" value="signalstack-sms" />
        <Metric label="Health route" value="/api/health" />
        <Metric label="Demo mode" value={String(status.safety.demoMode)} />
        <Metric
          label="External impact"
          value={status.safety.externalImpactBlocked ? "blocked" : "review"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Health Signals">
          <ul className="grid gap-3 text-sm">
            {healthSignals.map((signal) => (
              <li
                key={signal.name}
                className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[10rem_12rem_1fr]"
              >
                <span className="font-semibold text-slate-950">
                  {signal.name}
                </span>
                <span className="break-words font-mono text-xs text-slate-700">
                  {signal.value}
                </span>
                <span className="text-slate-600">{signal.note}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Runtime Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow
              label="Live messaging"
              value={String(status.safety.liveMessagingEnabled)}
            />
            <StatusRow
              label="Live billing"
              value={String(status.safety.liveBillingEnabled)}
            />
            <StatusRow
              label="Messaging provider"
              value={status.safety.messagingProvider}
            />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
            <StatusRow
              label="Production override"
              value={String(status.deployment.productionExternalOverride)}
            />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Demo-Safe Defaults">
          <dl className="grid gap-3 text-sm">
            {Object.entries(envDefaults).map(([key, value]) => (
              <StatusRow key={key} label={key} value={value} />
            ))}
          </dl>
        </Panel>

        <Panel title="Operational Links">
          <ul className="grid gap-3 text-sm">
            {operationLinks.map((link) => (
              <OperationLink
                key={link.href}
                href={link.href}
                label={link.label}
                note={link.note}
              />
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>
            No health probes, API requests, commands, scripts, migrations,
            tests, browser sessions, or git operations are executed from this
            view.
          </li>
          <li>
            No records are created, updated, deleted, exported, enqueued,
            replayed, billed, notified, sent, verified, or deployed.
          </li>
          <li>
            No provider APIs, live AI providers, Stripe APIs, notification
            services, Redis queues, or outbound webhooks are called.
          </li>
          <li>
            No raw environment values, `.env.local` contents, credentials, token
            fingerprints, provider verification results, logs, or secret-like
            values are displayed.
          </li>
        </ul>
      </Panel>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function OperationLink({
  href,
  label,
  note,
}: {
  href: string;
  label: string;
  note: string;
}) {
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
      <dd className="break-words text-right font-medium text-slate-950">
        {value}
      </dd>
    </div>
  );
}
