import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";

export const dynamic = "force-dynamic";

const contractFiles = [
  {
    name: "Database",
    path: "contracts/CONTRACT-DB.md",
    boundary: "Tenant orgId invariants, schema ownership, and migration discipline."
  },
  {
    name: "API",
    path: "contracts/CONTRACT-API.md",
    boundary: "Route inventory, request/response contracts, and local-only mutation boundaries."
  },
  {
    name: "Webhooks",
    path: "contracts/CONTRACT-WEBHOOKS.md",
    boundary: "Twilio inbound/status persistence, signature validation, and idempotency rules."
  },
  {
    name: "Provider Adapter",
    path: "contracts/CONTRACT-PROVIDER-ADAPTER.md",
    boundary: "Dummy-provider defaults and Twilio-ready adapter behavior behind live gates."
  },
  {
    name: "AI",
    path: "contracts/CONTRACT-AI.md",
    boundary: "Deterministic fake AI behavior and live AI blocking expectations."
  },
  {
    name: "Billing",
    path: "contracts/CONTRACT-BILLING.md",
    boundary: "Local usage records, billing metadata, and no live Stripe charges."
  },
  {
    name: "Compliance",
    path: "contracts/CONTRACT-COMPLIANCE.md",
    boundary: "Consent, STOP/HELP behavior, A2P readiness, and hard gates."
  },
  {
    name: "Queue",
    path: "contracts/CONTRACT-QUEUE.md",
    boundary: "Scheduled jobs, idempotency keys, worker safety, and optional BullMQ mirroring."
  },
  {
    name: "Testing",
    path: "contracts/CONTRACT-TESTING.md",
    boundary: "Validation commands, seeded demo coverage, and regression gates."
  }
];

const validationChecks = [
  {
    command: "npm run contracts:check",
    purpose: "Verifies required contract files and API map coverage remain present."
  },
  {
    command: "npm run validate",
    purpose: "Runs the local gate, including contract, compliance, safety, test, lint, typecheck, and build checks."
  },
  {
    command: "npm run test:e2e:demo",
    purpose: "Exercises the seeded investor demo path after local database migration and seed."
  },
  {
    command: "npm run secrets:scan",
    purpose: "Checks for secret-like values without displaying raw environment secrets."
  }
];

const driftControls = [
  "Product API routes must be documented in contracts and docs before or with implementation.",
  "Read-only settings pages must state the actions they do not perform.",
  "Live SMS, billing, notifications, provider calls, and live AI remain blocked by defaults.",
  "Tenant-scoped data access must preserve the orgId invariant and avoid cross-tenant reads.",
  "Seeded demo path coverage must expand when demo-visible operational routes are added."
];

export default async function ContractOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/api">
          API Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/security">
          Security Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Contract Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only contract and drift-control review for {currentOrg.orgName}. This page displays local contract
            inventory, validation commands, and safety boundaries only; it does not execute checks, scan files, mutate
            records, call providers, create billing records, send notifications, expose secrets, or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Contract files" value={String(contractFiles.length)} />
        <Metric label="Validation checks" value={String(validationChecks.length)} />
        <Metric label="Live SMS" value="blocked" />
        <Metric label="External impact" value="none" />
      </section>

      <Panel title="Contract Inventory">
        <ul className="grid gap-3 text-sm">
          {contractFiles.map((contract) => (
            <li key={contract.path} className="grid gap-2 border-b border-slate-100 pb-3 lg:grid-cols-[10rem_18rem_1fr]">
              <span className="font-medium text-slate-950">{contract.name}</span>
              <span className="break-words font-mono text-xs text-slate-800">{contract.path}</span>
              <span className="text-slate-600">{contract.boundary}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Validation Commands">
          <ul className="grid gap-3 text-sm">
            {validationChecks.map((check) => (
              <li key={check.command} className="grid gap-2 border-b border-slate-100 pb-3">
                <span className="break-words font-mono text-xs font-semibold text-slate-950">{check.command}</span>
                <span className="text-slate-600">{check.purpose}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Drift Controls">
          <ul className="grid gap-2 text-sm text-slate-700">
            {driftControls.map((control) => (
              <li key={control}>{control}</li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>This view is static local metadata plus the current demo organization name.</li>
          <li>It does not read contract file contents, run validation commands, or expose raw environment values.</li>
          <li>It does not create or update contacts, campaigns, queue jobs, webhooks, billing records, provider metadata, or audit events.</li>
          <li>No provider calls, live SMS, live AI, Stripe calls, notifications, email, secrets, mutations, or live feature enablement occur here.</li>
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
