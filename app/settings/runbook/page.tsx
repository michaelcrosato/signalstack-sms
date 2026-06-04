import Link from "next/link";
import type { ReactNode } from "react";
import { getRunbookAdminLinks } from "@/lib/operations/operator-surfaces";
import { SettingsLink } from "@/app/settings/components/settings-link";

const requiredDefaults = [
  ["DEMO_MODE", "true"],
  ["LIVE_MESSAGING_ENABLED", "false"],
  ["LIVE_BILLING_ENABLED", "false"],
  ["MESSAGING_PROVIDER", "dummy"],
  ["AI_PROVIDER", "fake"],
];

const dailyStartCommands = [
  "npm install",
  "npm run db:generate",
  "$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate",
  "$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run demo:seed",
  "npm run validate",
  "$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run test:e2e:demo",
];

const workerCommands = [
  "$env:LIVE_MESSAGING_ENABLED='false'",
  "$env:MESSAGING_PROVIDER='dummy'",
  "npm run worker",
  "$env:WORKER_MAX_ITERATIONS='1'",
  "$env:WORKER_POLL_INTERVAL_MS='1000'",
  "npm run worker:watch",
];

const bullmqCommands = [
  "$env:QUEUE_BACKEND='bullmq'",
  "$env:REDIS_URL='redis://localhost:6379'",
  "$env:LIVE_MESSAGING_ENABLED='false'",
  "$env:MESSAGING_PROVIDER='dummy'",
  "npm run queue:bullmq:smoke",
];

const repairSteps = [
  "Diagnose the smallest failing command.",
  "Repair the local code, docs, contracts, or tests.",
  "Rerun the smallest failing command.",
  "Rerun npm run validate.",
  "Rerun npm run test:e2e:demo when the seeded demo path is touched.",
];

const adminLinks = getRunbookAdminLinks();

export default function OperatorRunbookPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          <HeaderLink href="/settings" label="Go-Live Readiness" />
          <HeaderLink href="/settings/operations" label="Operations Index" />
          <HeaderLink href="/settings/demo" label="Demo Operations" />
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">
            Settings
          </p>
          <h1 className="text-4xl font-semibold text-slate-950">
            Operator Runbook
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local checklist for demo-safe operation. This page
            displays commands and safety boundaries only; it does not execute
            commands, mutate records, call providers, create billing records,
            send notifications, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Required Defaults">
          <dl className="grid gap-3 text-sm">
            {requiredDefaults.map(([label, value]) => (
              <StatusRow key={label} label={label} value={value} />
            ))}
          </dl>
        </Panel>

        <Panel title="Safety Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Live SMS" value="blocked" />
            <StatusRow label="Live billing" value="blocked" />
            <StatusRow label="Provider calls" value="none" />
            <StatusRow label="Secrets" value="not displayed" />
            <StatusRow label="Command execution" value="none" />
          </dl>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <CommandPanel title="Daily Local Start" commands={dailyStartCommands} />
        <CommandPanel title="Local Workers" commands={workerCommands} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <CommandPanel title="BullMQ Smoke" commands={bullmqCommands} />
        <Panel title="Repair Loop">
          <ol className="grid gap-3 text-sm text-slate-700">
            {repairSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-teal-700 text-xs font-semibold text-teal-700">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <Panel title="Local Admin Views">
        <nav
          aria-label="Local admin views"
          className="grid gap-3 text-sm md:grid-cols-4"
        >
          {adminLinks.map((link) => (
            <AdminLink key={link.href} href={link.href} label={link.label} />
          ))}
        </nav>
      </Panel>
    </main>
  );
}

function CommandPanel({
  title,
  commands,
}: {
  title: string;
  commands: string[];
}) {
  return (
    <Panel title={title}>
      <ol className="grid gap-3">
        {commands.map((command) => (
          <li
            key={command}
            className="break-words rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
          >
            {command}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function AdminLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="rounded border border-slate-200 px-3 py-2 font-semibold text-teal-700"
      href={href}
    >
      {label}
    </Link>
  );
}

function HeaderLink({ href, label }: { href: string; label: string }) {
  return <SettingsLink href={href}>{label}</SettingsLink>;
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
