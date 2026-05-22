import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import { getComplianceOperationLinks } from "@/lib/operations/operator-surfaces";
import { buildReadinessAuditExportHref } from "@/lib/operations/readiness-audit-operations";

export const dynamic = "force-dynamic";

const profileFields = [
  { key: "businessName", label: "Business name" },
  { key: "messagingUseCase", label: "Messaging use case" },
  { key: "optInDescription", label: "Opt-in description" },
  { key: "privacyPolicyUrl", label: "Privacy policy URL" },
  { key: "termsOfServiceUrl", label: "Terms of service URL" }
] as const;

export default async function ComplianceSettingsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [profile, auditEvents] = await Promise.all([
    getOrCreateComplianceProfile(currentOrg.orgId),
    listLiveReadinessAuditEvents(currentOrg.orgId, 8, { subjectType: "ComplianceProfile" })
  ]);
  const gate = evaluateMessagingHardGate({
    demoMode: currentOrg.demoMode,
    liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
    messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
    complianceProfile: profile
  });
  const complete = complianceProfileIsComplete(profile);
  const operationLinks = getComplianceOperationLinks();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          {operationLinks.map((link) => (
            <Link key={link.href} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Compliance Detail</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only compliance profile and hard-gate status for {currentOrg.orgName}. Live messaging remains blocked by
            demo-safe runtime defaults.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Profile complete" value={String(complete)} />
        <Metric label="A2P status" value={profile.a2pRegistrationStatus} />
        <Metric label="Live messaging" value={gate.allowed ? "review" : "blocked"} />
        <Metric label="Blockers" value={String(gate.reasons.length)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Compliance Profile">
          <dl className="grid gap-3 text-sm">
            {profileFields.map((field) => (
              <StatusRow key={field.key} label={field.label} value={profile[field.key] ? "present" : "missing"} />
            ))}
            <StatusRow label="Created" value={profile.createdAt.toISOString()} />
            <StatusRow label="Updated" value={profile.updatedAt.toISOString()} />
          </dl>
        </Panel>

        <Panel title="Hard Gate">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Demo mode" value={String(currentOrg.demoMode)} />
            <StatusRow label="Live flag" value={String(process.env.LIVE_MESSAGING_ENABLED === "true")} />
            <StatusRow label="Provider" value={process.env.MESSAGING_PROVIDER ?? "dummy"} />
            <StatusRow label="Checklist complete" value={String(complete)} />
            <StatusRow label="Live messaging allowed" value={String(gate.allowed)} />
          </dl>
        </Panel>
      </section>

      <Panel title="Blockers">
        <ul className="grid gap-2 text-sm text-slate-700">
          {gate.reasons.length > 0 ? gate.reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>No blockers recorded.</li>}
        </ul>
      </Panel>

      <Panel title="Compliance Audit">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-600">Recent local readiness audit events for the compliance profile.</p>
          <Link
            className="text-sm font-medium text-teal-700"
            href={buildReadinessAuditExportHref({ subjectType: "ComplianceProfile" })}
          >
            Export Compliance CSV
          </Link>
        </div>
        <ul className="grid gap-3 text-sm">
          {auditEvents.length > 0 ? (
            auditEvents.map((event) => (
              <li key={event.id} className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <span className="font-medium text-slate-950">{event.action}</span>
                <time className="text-slate-600" dateTime={event.createdAt.toISOString()}>
                  {event.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No compliance audit events recorded.</li>
          )}
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-950">{value}</dd>
    </div>
  );
}


