import Link from "next/link";
import { envDefaults } from "@/lib/env/defaults";

const launchLinks = [
  {
    href: "/demo",
    title: "Demo Console",
    description: "Seeded investor path for imports, campaigns, inbox, AI, analytics, and usage."
  },
  {
    href: "/settings",
    title: "Go-Live Readiness",
    description: "Compliance, provider blockers, readiness audit, numbers, queue, and API protection."
  },
  {
    href: "/settings/campaigns",
    title: "Campaign Operations",
    description: "Read-only campaign status, recipient counts, queued jobs, and local worker boundary."
  },
  {
    href: "/settings/queue",
    title: "Queue Operations",
    description: "Read-only scheduled job timing, payload validity, worker settings, and queue safety boundary."
  },
  {
    href: "/settings/contacts",
    title: "Contact Operations",
    description: "Read-only contact consent, imports, tags, lists, and local data safety boundary."
  },
  {
    href: "/settings/data",
    title: "Data Operations",
    description: "Read-only local record totals, soft-archive state, import ledger, and retention boundaries."
  },
  {
    href: "/settings/audience",
    title: "Audience Operations",
    description: "Read-only tags, lists, saved segments, definitions, and audience safety boundary."
  },
  {
    href: "/settings/templates",
    title: "Template Operations",
    description: "Read-only message template variables, campaign usage, previews, and safety boundary."
  },
  {
    href: "/settings/inbox",
    title: "Inbox Operations",
    description: "Read-only shared inbox status, assignment counts, recent messages, and safety boundary."
  },
  {
    href: "/settings/webhooks",
    title: "Webhook Operations",
    description: "Read-only Twilio webhook route coverage, idempotency metadata, and local event history."
  },
  {
    href: "/settings/delivery",
    title: "Delivery Operations",
    description: "Read-only message delivery metadata, provider status counts, and no-retry safety boundary."
  },
  {
    href: "/settings/team",
    title: "Team Operations",
    description: "Read-only organization metadata, membership roles, assigned threads, and safety boundary."
  },
  {
    href: "/settings/provider",
    title: "Provider Details",
    description: "Redacted local Twilio metadata, safe forms, rotation history, and CSV export."
  },
  {
    href: "/settings/numbers",
    title: "Provider Numbers",
    description: "Read-only local number metadata, default sender status, capabilities, and safety boundary."
  },
  {
    href: "/settings/compliance",
    title: "Compliance Detail",
    description: "Read-only profile completeness, A2P metadata, hard-gate blockers, and audit export."
  },
  {
    href: "/settings/system",
    title: "System Status",
    description: "Read-only runtime flags, queue backend, worker limits, and rate-limit policy."
  },
  {
    href: "/settings/api",
    title: "API Operations",
    description: "Read-only API route inventory, mutation boundaries, and rate-limit policy."
  },
  {
    href: "/settings/contracts",
    title: "Contract Operations",
    description: "Read-only contract inventory, drift controls, validation commands, and safety boundary."
  },
  {
    href: "/settings/validation",
    title: "Validation Operations",
    description: "Read-only local gate inventory, repair signals, and validation safety boundary."
  },
  {
    href: "/settings/security",
    title: "Security Operations",
    description: "Read-only safety gates, secret boundaries, rate limiting, and production controls."
  },
  {
    href: "/settings/notifications",
    title: "Notification Operations",
    description: "Read-only email, alert, webhook, and SMS notification no-send boundary."
  },
  {
    href: "/settings/runbook",
    title: "Operator Runbook",
    description: "Local validation, seed, worker, export, and repair-loop commands with safety boundaries."
  },
  {
    href: "/settings/usage",
    title: "Usage & Analytics",
    description: "Tenant metrics, local usage totals, billing boundary, and recent usage events."
  },
  {
    href: "/settings/billing",
    title: "Billing Operations",
    description: "Read-only local billing account status, live billing blockers, and usage boundary."
  },
  {
    href: "/settings/ai",
    title: "AI Operations",
    description: "Read-only fake AI provider status, live-AI boundary, endpoints, and local AI usage."
  },
  {
    href: "/settings/exports",
    title: "Admin Exports",
    description: "Local CSV links for readiness audit and redacted provider rotation history."
  },
  {
    href: "/settings/readiness-audit",
    title: "Readiness Audit",
    description: "Read-only local go-live readiness history, filters, and bounded CSV export."
  }
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <section className="space-y-4 border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Local Launch Dashboard
        </p>
        <h1 className="text-4xl font-semibold text-slate-950">SignalStack SMS</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-700">
          Demo-safe command center for the local SMB texting SaaS implementation. Live messaging,
          billing, provider calls, notifications, and live AI remain blocked by default.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Local views">
        {launchLinks.map((item) => (
          <Link
            key={item.href}
            className="rounded border border-slate-200 bg-white p-5 transition hover:border-teal-700"
            href={item.href}
          >
            <span className="text-lg font-semibold text-slate-950">{item.title}</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{item.description}</span>
          </Link>
        ))}
      </section>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {Object.entries(envDefaults).map(([key, value]) => (
          <div key={key} className="rounded border border-slate-200 bg-white p-4">
            <dt className="font-medium text-slate-900">{key}</dt>
            <dd className="mt-1 text-slate-600">{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
