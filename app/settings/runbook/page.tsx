import Link from "next/link";
import type { ReactNode } from "react";

const requiredDefaults = [
  ["DEMO_MODE", "true"],
  ["LIVE_MESSAGING_ENABLED", "false"],
  ["LIVE_BILLING_ENABLED", "false"],
  ["MESSAGING_PROVIDER", "dummy"],
  ["AI_PROVIDER", "fake"]
];

const dailyStartCommands = [
  "npm install",
  "npm run db:generate",
  "$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate",
  "$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run demo:seed",
  "npm run validate",
  "$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run test:e2e:demo"
];

const workerCommands = [
  "$env:LIVE_MESSAGING_ENABLED='false'",
  "$env:MESSAGING_PROVIDER='dummy'",
  "npm run worker",
  "$env:WORKER_MAX_ITERATIONS='1'",
  "$env:WORKER_POLL_INTERVAL_MS='1000'",
  "npm run worker:watch"
];

const bullmqCommands = [
  "$env:QUEUE_BACKEND='bullmq'",
  "$env:REDIS_URL='redis://localhost:6379'",
  "$env:LIVE_MESSAGING_ENABLED='false'",
  "$env:MESSAGING_PROVIDER='dummy'",
  "npm run queue:bullmq:smoke"
];

const repairSteps = [
  "Diagnose the smallest failing command.",
  "Repair the local code, docs, contracts, or tests.",
  "Rerun the smallest failing command.",
  "Rerun npm run validate.",
  "Rerun npm run test:e2e:demo when the seeded demo path is touched."
];

export default function OperatorRunbookPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/compliance">
          Compliance Detail
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/system">
          System Status
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/campaigns">
          Campaign Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/queue">
          Queue Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contacts">
          Contact Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/data">
          Data Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/templates">
          Template Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/audience">
          Audience Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/inbox">
          Inbox Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/team">
          Team Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/webhooks">
          Webhook Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/delivery">
          Delivery Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/exports">
          Admin Exports
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/provider">
          Provider Details
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/numbers">
          Provider Numbers
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/billing">
          Billing Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/reports">
          Reporting Index
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/ai">
          AI Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contracts">
          Contract Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/validation">
          Validation Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/api">
          API Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/security">
          Security Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/notifications">
          Notification Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/integrations">
          Integration Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/workflows">
          Workflow Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/readiness-audit">
          Readiness Audit
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Operator Runbook</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local checklist for demo-safe operation. This page displays commands and safety boundaries only; it does not
            execute commands, mutate records, call providers, create billing records, send notifications, or enable live messaging.
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
        <nav aria-label="Local admin views" className="grid gap-3 text-sm md:grid-cols-4">
          <AdminLink href="/settings/system" label="System Status" />
          <AdminLink href="/settings/compliance" label="Compliance Detail" />
          <AdminLink href="/settings/campaigns" label="Campaign Operations" />
          <AdminLink href="/settings/queue" label="Queue Operations" />
          <AdminLink href="/settings/contacts" label="Contact Operations" />
          <AdminLink href="/settings/data" label="Data Operations" />
          <AdminLink href="/settings/audience" label="Audience Operations" />
          <AdminLink href="/settings/templates" label="Template Operations" />
          <AdminLink href="/settings/inbox" label="Inbox Operations" />
          <AdminLink href="/settings/webhooks" label="Webhook Operations" />
          <AdminLink href="/settings/delivery" label="Delivery Operations" />
          <AdminLink href="/settings/team" label="Team Operations" />
          <AdminLink href="/settings/usage" label="Usage & Analytics" />
          <AdminLink href="/settings/billing" label="Billing Operations" />
          <AdminLink href="/settings/reports" label="Reporting Index" />
          <AdminLink href="/settings/ai" label="AI Operations" />
          <AdminLink href="/settings/contracts" label="Contract Operations" />
          <AdminLink href="/settings/validation" label="Validation Operations" />
          <AdminLink href="/settings/api" label="API Operations" />
          <AdminLink href="/settings/security" label="Security Operations" />
          <AdminLink href="/settings/notifications" label="Notification Operations" />
          <AdminLink href="/settings/integrations" label="Integration Operations" />
          <AdminLink href="/settings/workflows" label="Workflow Operations" />
          <AdminLink href="/settings/readiness-audit" label="Readiness Audit" />
          <AdminLink href="/settings/exports" label="Admin Exports" />
          <AdminLink href="/settings/provider" label="Provider Details" />
          <AdminLink href="/settings/numbers" label="Provider Numbers" />
        </nav>
      </Panel>
    </main>
  );
}

function CommandPanel({ title, commands }: { title: string; commands: string[] }) {
  return (
    <Panel title={title}>
      <ol className="grid gap-3">
        {commands.map((command) => (
          <li key={command} className="break-words rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
            {command}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function AdminLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="rounded border border-slate-200 px-3 py-2 font-semibold text-teal-700" href={href}>
      {label}
    </Link>
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
