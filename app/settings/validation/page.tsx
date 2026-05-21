import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getValidationOperationLinks } from "@/lib/operations/operator-surfaces";
import { getValidationOperationsStatus } from "@/lib/operations/validation-operations";

export const dynamic = "force-dynamic";

export default async function ValidationOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const operationLinks = getValidationOperationLinks();
  const status = getValidationOperationsStatus();

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

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="Gate commands" value={String(status.gateCommandCount)} />
        <Metric label="Command execution" value={status.commandExecution} />
        <Metric label="External impact" value={status.externalImpact} />
        <Metric label="Mutation" value={status.mutation} />
        <Metric label="Secrets displayed" value={String(status.secretsDisplayed)} />
      </section>

      <Panel title="Gate Inventory">
        <ul className="grid gap-3 text-sm">
          {status.gateCommands.map((gate) => (
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
            {status.repairSignals.map((signal) => (
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
