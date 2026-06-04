import Link from "next/link";
import type { ReactNode } from "react";
import {
  getOperatorSurfaceSummary,
  operatorSurfaceGroups,
} from "@/lib/operations/operator-surfaces";
import { SettingsLayout } from "@/components/layout/settings-layout";

export const dynamic = "force-static";

const operationSummary = getOperatorSurfaceSummary();

export default function OperationsIndexPage() {
  return (
    <SettingsLayout>
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          <HeaderLink href="/" label="Local Launch Dashboard" />
          <HeaderLink href="/settings/demo" label="Demo Operations" />
          <HeaderLink href="/settings/runbook" label="Operator Runbook" />
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">
            Settings
          </p>
          <h1 className="text-4xl font-semibold text-slate-950">
            Operations Index
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local index of existing operator surfaces. This page
            groups navigation and safety boundaries only; it does not execute
            commands, inspect files, call APIs, mutate records, create exports,
            call providers, bill, notify, send SMS or email, expose secrets, or
            enable live features.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Groups" value={String(operationSummary.groupCount)} />
        <Metric
          label="Local Surfaces"
          value={String(operationSummary.surfaceCount)}
        />
        <Metric label="Mutations" value="none" />
        <Metric label="External Impact" value="blocked" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {operatorSurfaceGroups.map((group) => (
          <Panel key={group.name} title={group.name}>
            <ul className="grid gap-3 text-sm">
              {group.links.map((item) => (
                <li
                  key={item.href}
                  className="rounded border border-slate-200 p-4"
                >
                  <Link
                    className="font-semibold text-teal-700"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                  <p className="mt-2 text-slate-600">{item.note}</p>
                  <p className="mt-2 break-words font-mono text-xs text-slate-500">
                    {item.href}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>
            No database records, queue jobs, readiness audit events, provider
            metadata, billing records, notifications, or exports are created or
            changed.
          </li>
          <li>
            No commands, scripts, migrations, tests, browser sessions, git
            operations, file scans, log inspections, or API probes are executed.
          </li>
          <li>
            No Twilio, Stripe, live AI, notification provider, Redis, email,
            SMS, outbound webhook, or provider verification call is made.
          </li>
          <li>
            No raw environment values, `.env.local` contents, credentials, token
            fingerprints, provider verification results, message bodies, logs,
            diffs, or secrets are displayed.
          </li>
        </ul>
      </Panel>
    </SettingsLayout>
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
