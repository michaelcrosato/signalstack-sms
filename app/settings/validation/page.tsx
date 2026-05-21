import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getValidationOperationLinks } from "@/lib/operations/operator-surfaces";

export const dynamic = "force-dynamic";

const gateCommands = [
  {
    command: "npm run validate",
    area: "full local gate",
    boundary: "Runs local checks only and must keep demo-safe defaults."
  },
  {
    command: "npm run contracts:check",
    area: "contracts",
    boundary: "Checks required docs/contracts and API map coverage."
  },
  {
    command: "npm run compliance:check",
    area: "safety defaults",
    boundary: "Verifies live messaging, billing, provider, and AI defaults stay blocked."
  },
  {
    command: "npm run production:gate",
    area: "deployment",
    boundary: "Blocks unsafe production-like live-impact configuration without explicit future override."
  },
  {
    command: "npm run observability:check",
    area: "observability",
    boundary: "Verifies demo-safe observability planning docs exist."
  },
  {
    command: "npm run operator:check",
    area: "runbook",
    boundary: "Verifies the local operator runbook remains present and demo-safe."
  },
  {
    command: "npm run platform:check",
    area: "platform",
    boundary: "Verifies demo-safe deployment platform notes exist."
  },
  {
    command: "npm run secrets:scan",
    area: "secrets",
    boundary: "Scans committed files for secret-like values without displaying local env secrets."
  },
  {
    command: "npm run test:e2e:demo",
    area: "investor demo",
    boundary: "Exercises the seeded demo path after explicit local database migration and seeding."
  }
];

const validationSignals = [
  "The page does not execute commands or inspect process output.",
  "Database migration and demo seed still require an explicit local DATABASE_URL command.",
  "Playwright coverage should expand when demo-visible admin pages are added.",
  "Live provider, live billing, notification, and live AI settings must stay blocked in validation.",
  "Failures should be repaired by rerunning the smallest failing command before the full gate."
];

export default async function ValidationOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const operationLinks = getValidationOperationLinks();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        {operationLinks.map((link) => (
          <Link key={link.href} className="text-sm font-medium text-teal-700" href={link.href}>
            {link.label}
          </Link>
        ))}
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Validation Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only validation gate review for {currentOrg.orgName}. This page displays local check inventory and
            repair signals only; it does not execute commands, inspect logs, scan files, mutate records, call providers,
            create billing records, send notifications, expose secrets, or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Gate commands" value={String(gateCommands.length)} />
        <Metric label="Command execution" value="none" />
        <Metric label="Live impact" value="blocked" />
        <Metric label="Secrets displayed" value="false" />
      </section>

      <Panel title="Gate Inventory">
        <ul className="grid gap-3 text-sm">
          {gateCommands.map((gate) => (
            <li key={gate.command} className="grid gap-2 border-b border-slate-100 pb-3 lg:grid-cols-[16rem_10rem_1fr]">
              <span className="break-words font-mono text-xs font-semibold text-slate-950">{gate.command}</span>
              <span className="text-slate-700">{gate.area}</span>
              <span className="text-slate-600">{gate.boundary}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Repair Signals">
          <ul className="grid gap-2 text-sm text-slate-700">
            {validationSignals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="Safety Boundary">
          <ul className="grid gap-2 text-sm text-slate-700">
            <li>This view displays static command metadata and the current demo organization name only.</li>
            <li>It does not run `npm`, `prisma`, Playwright, validation scripts, shell commands, or database migrations.</li>
            <li>It does not read `.env.local`, validation logs, test reports, raw secrets, or provider credentials.</li>
            <li>No provider calls, live AI, Stripe calls, notifications, email, SMS, mutations, or live feature enablement occur here.</li>
          </ul>
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
