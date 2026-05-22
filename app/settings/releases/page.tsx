import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getReleaseOperationSurfaceLinks } from "@/lib/operations/operator-surfaces";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

const releaseChecks = [
  {
    name: "Protected local gate",
    command: "npm run validate",
    boundary: "Validation remains local and demo-safe; this page displays the command but never executes it."
  },
  {
    name: "Database migration",
    command: "npm run db:migrate",
    boundary: "Local migration discipline is documented; no production database operation is started from this view."
  },
  {
    name: "Demo seed",
    command: "npm run demo:seed",
    boundary: "Seeded demo data is prepared by an operator command only, not by this read-only page."
  },
  {
    name: "Investor demo path",
    command: "npm run test:e2e:demo",
    boundary: "Seeded Playwright coverage is reviewed as a release expectation without launching browsers here."
  },
  {
    name: "Premerge mirror",
    command: "npm run premerge",
    boundary: "Premerge stays a local script alias for validation and does not publish, deploy, bill, notify, or send."
  }
];

export default async function ReleaseOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const status = getSystemStatus(process.env);
  const releaseSurfaces = getReleaseOperationSurfaceLinks();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          <HeaderLink href="/settings" label="Go-Live Readiness" />
          <HeaderLink href="/settings/validation" label="Validation Operations" />
          <HeaderLink href="/settings/contracts" label="Contract Operations" />
          <HeaderLink href="/settings/runbook" label="Operator Runbook" />
          <HeaderLink href="/settings/demo" label="Demo Operations" />
          <HeaderLink href="/settings/workflows" label="Workflow Operations" />
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Release Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only release readiness checkpoint for {currentOrg.orgName}. This page maps local gate, seed, demo
            path, contract, security, and rollback expectations without executing commands, committing changes,
            deploying, mutating records, exposing secrets, calling providers, billing, notifying, or enabling live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
        <Metric label="Demo mode" value={String(status.safety.demoMode)} />
        <Metric label="Production override" value={String(status.deployment.productionExternalOverride)} />
        <Metric label="Command execution" value="none" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Release Checklist">
          <ul className="grid gap-3 text-sm">
            {releaseChecks.map((check) => (
              <li key={check.name} className="grid gap-2 border-b border-slate-100 pb-3 lg:grid-cols-[11rem_12rem_1fr]">
                <span className="font-semibold text-slate-950">{check.name}</span>
                <span className="break-words font-mono text-xs text-slate-700">{check.command}</span>
                <span className="text-slate-600">{check.boundary}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Runtime Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Live messaging" value={String(status.safety.liveMessagingEnabled)} />
            <StatusRow label="Live billing" value={String(status.safety.liveBillingEnabled)} />
            <StatusRow label="Messaging provider" value={status.safety.messagingProvider} />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
            <StatusRow label="API protection" value={status.apiRateLimit.enabled ? "enabled" : "disabled"} />
          </dl>
        </Panel>
      </section>

      <Panel title="Release Surfaces">
        <ul className="grid gap-3 text-sm md:grid-cols-2">
          {releaseSurfaces.map((surface) => (
            <li key={surface.href} className="rounded border border-slate-200 p-4">
              <Link className="font-semibold text-teal-700" href={surface.href}>
                {surface.label}
              </Link>
              <p className="mt-2 text-slate-600">{surface.note}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>No commands, scripts, migrations, tests, browser sessions, deploys, git operations, or release jobs are executed from this view.</li>
          <li>No records are created, updated, deleted, exported, enqueued, replayed, billed, notified, sent, verified, or deployed.</li>
          <li>No provider APIs, live AI providers, Stripe APIs, notification services, Redis queues, or outbound webhooks are called.</li>
          <li>No credentials, token fingerprints, raw environment values, provider verification results, commit diffs, logs, or secret-like values are displayed.</li>
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

function HeaderLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50"
      href={href}
    >
      {label}
    </Link>
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
