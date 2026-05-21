import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-static";

const operationGroups = [
  {
    name: "Demo And Workflow",
    links: [
      { href: "/demo", label: "Demo Console", note: "seeded investor path" },
      { href: "/settings/demo", label: "Demo Operations", note: "seed readiness and runtime gates" },
      { href: "/settings/workflows", label: "Workflow Operations", note: "local workflow checkpoints" },
      { href: "/settings/releases", label: "Release Operations", note: "release gate references" }
    ]
  },
  {
    name: "Data And Messaging",
    links: [
      { href: "/settings/contacts", label: "Contact Operations", note: "consent and import metadata" },
      { href: "/settings/audience", label: "Audience Operations", note: "tags, lists, and segments" },
      { href: "/settings/templates", label: "Template Operations", note: "template variables and usage" },
      { href: "/settings/campaigns", label: "Campaign Operations", note: "campaign and queue state" },
      { href: "/settings/queue", label: "Queue Operations", note: "scheduled job metadata" },
      { href: "/settings/inbox", label: "Inbox Operations", note: "conversation status and notes" },
      { href: "/settings/webhooks", label: "Webhook Operations", note: "stored webhook metadata" },
      { href: "/settings/delivery", label: "Delivery Operations", note: "message delivery state" }
    ]
  },
  {
    name: "Safety And Runtime",
    links: [
      { href: "/settings", label: "Go-Live Readiness", note: "provider and compliance blockers" },
      { href: "/settings/system", label: "System Status", note: "runtime flags and queue backend" },
      { href: "/settings/environment", label: "Environment Operations", note: "safe config categories" },
      { href: "/settings/health", label: "Health Operations", note: "health contract and blockers" },
      { href: "/settings/security", label: "Security Operations", note: "safety gates and secret boundaries" },
      { href: "/settings/validation", label: "Validation Operations", note: "local gate and repair signals" },
      { href: "/settings/contracts", label: "Contract Operations", note: "contract drift controls" },
      { href: "/settings/api", label: "API Operations", note: "route inventory and rate limits" }
    ]
  },
  {
    name: "Provider And Reporting",
    links: [
      { href: "/settings/provider", label: "Provider Details", note: "redacted local credential metadata" },
      { href: "/settings/numbers", label: "Provider Numbers", note: "local number metadata" },
      { href: "/settings/compliance", label: "Compliance Detail", note: "profile and hard-gate blockers" },
      { href: "/settings/readiness-audit", label: "Readiness Audit", note: "local readiness history" },
      { href: "/settings/exports", label: "Admin Exports", note: "bounded local CSV links" },
      { href: "/settings/reports", label: "Reporting Index", note: "reporting surface map" },
      { href: "/settings/usage", label: "Usage & Analytics", note: "tenant metrics and local usage" },
      { href: "/settings/billing", label: "Billing Operations", note: "local billing boundary" },
      { href: "/settings/ai", label: "AI Operations", note: "fake AI boundary and usage" },
      { href: "/settings/notifications", label: "Notification Operations", note: "no-send notification boundary" },
      { href: "/settings/integrations", label: "Integration Operations", note: "external-impact integrations" },
      { href: "/settings/team", label: "Team Operations", note: "membership metadata" },
      { href: "/settings/data", label: "Data Operations", note: "record totals and archive state" },
      { href: "/settings/runbook", label: "Operator Runbook", note: "local commands as read-only text" }
    ]
  }
];

const totalLinks = operationGroups.reduce((total, group) => total + group.links.length, 0);

export default function OperationsIndexPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/">
          Local Launch Dashboard
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/demo">
          Demo Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Operations Index</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local index of existing operator surfaces. This page groups navigation and safety boundaries only;
            it does not execute commands, inspect files, call APIs, mutate records, create exports, call providers, bill,
            notify, send SMS or email, expose secrets, or enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Groups" value={String(operationGroups.length)} />
        <Metric label="Local Surfaces" value={String(totalLinks)} />
        <Metric label="Mutations" value="none" />
        <Metric label="External Impact" value="blocked" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {operationGroups.map((group) => (
          <Panel key={group.name} title={group.name}>
            <ul className="grid gap-3 text-sm">
              {group.links.map((item) => (
                <li key={item.href} className="rounded border border-slate-200 p-4">
                  <Link className="font-semibold text-teal-700" href={item.href}>
                    {item.label}
                  </Link>
                  <p className="mt-2 text-slate-600">{item.note}</p>
                  <p className="mt-2 break-words font-mono text-xs text-slate-500">{item.href}</p>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>No database records, queue jobs, readiness audit events, provider metadata, billing records, notifications, or exports are created or changed.</li>
          <li>No commands, scripts, migrations, tests, browser sessions, git operations, file scans, log inspections, or API probes are executed.</li>
          <li>No Twilio, Stripe, live AI, notification provider, Redis, email, SMS, outbound webhook, or provider verification call is made.</li>
          <li>No raw environment values, `.env.local` contents, credentials, token fingerprints, provider verification results, message bodies, logs, diffs, or secrets are displayed.</li>
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
