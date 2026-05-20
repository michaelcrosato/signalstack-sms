import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";
import { getProviderCredential, listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";
import { listProviderPhoneNumbers } from "@/lib/db/repositories/provider-numbers";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import { getProviderSettings } from "@/lib/messaging/provider/settings";
import { getQueueBackend } from "@/lib/queue/bullmq";
import { getApiRateLimitPolicy } from "@/lib/rate-limit/api-rate-limit";
import { readinessAuditQuerySchema } from "@/lib/validation/readiness-audit";

export const dynamic = "force-dynamic";

const readinessAuditActions = [
  "COMPLIANCE_PROFILE_UPDATED",
  "PROVIDER_NUMBER_UPSERTED",
  "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
  "PROVIDER_CREDENTIAL_METADATA_DELETED"
];

type SettingsPageProps = {
  searchParams?: Promise<{
    auditAction?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const auditActionFilter = readinessAuditQuerySchema.shape.action.safeParse(params?.auditAction);
  const selectedAuditAction = auditActionFilter.success ? auditActionFilter.data : undefined;
  const currentOrg = await getOrCreateCurrentOrg();
  const [complianceProfile, numbers, auditEvents, providerCredential, credentialRotations] = await Promise.all([
    getOrCreateComplianceProfile(currentOrg.orgId),
    listProviderPhoneNumbers(currentOrg.orgId),
    listLiveReadinessAuditEvents(currentOrg.orgId, 12, { action: selectedAuditAction }),
    getProviderCredential(currentOrg.orgId, "twilio"),
    listProviderCredentialRotations(currentOrg.orgId, "twilio", 5)
  ]);
  const providerSettings = getProviderSettings({
    demoMode: currentOrg.demoMode,
    liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
    messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
    complianceProfile,
    providerCredential,
    env: process.env
  });
  const apiRateLimit = getApiRateLimitPolicy(process.env);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/exports">
          Admin Exports
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/compliance">
          Compliance Detail
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/campaigns">
          Campaign Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/inbox">
          Inbox Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/numbers">
          Provider Numbers
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/system">
          System Status
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/usage">
          Usage & Analytics
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Go-Live Readiness</h1>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Provider" value={providerSettings.provider} />
        <Metric label="Live SMS" value={String(providerSettings.liveMessagingAllowed)} />
        <Metric label="Numbers" value={String(numbers.length)} />
        <Metric label="Queue" value={getQueueBackend(process.env)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Compliance">
          <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/compliance">
            Compliance Detail
          </Link>
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Profile complete" value={String(providerSettings.compliance.complete)} />
            <StatusRow label="A2P status" value={providerSettings.compliance.a2pRegistrationStatus} />
            <StatusRow label="Privacy policy" value={complianceProfile.privacyPolicyUrl ? "present" : "missing"} />
            <StatusRow label="Terms" value={complianceProfile.termsOfServiceUrl ? "present" : "missing"} />
          </dl>
        </Panel>

        <Panel title="Twilio Readiness">
          <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/provider">
            Provider Details
          </Link>
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Account SID" value={String(providerSettings.twilio.accountSidConfigured)} />
            <StatusRow label="Auth token" value={String(providerSettings.twilio.authTokenConfigured)} />
            <StatusRow label="From number" value={String(providerSettings.twilio.fromNumberConfigured)} />
            <StatusRow label="Configured" value={String(providerSettings.twilio.configured)} />
            <StatusRow label="Source" value={providerSettings.twilio.source} />
            <StatusRow label="Account" value={providerSettings.twilio.accountSidRedacted ?? "not stored"} />
            <StatusRow label="From" value={providerSettings.twilio.fromNumberRedacted ?? "not stored"} />
          </dl>
        </Panel>
      </section>

      <Panel title="API Protection">
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <StatusRow label="Rate limit enabled" value={String(apiRateLimit.enabled)} />
          <StatusRow label="Requests" value={String(apiRateLimit.limit)} />
          <StatusRow label="Window seconds" value={String(apiRateLimit.windowMs / 1000)} />
        </dl>
      </Panel>

      <Panel title="Campaign Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/campaigns">
          Campaign Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review campaign status, recipient counts, and queued scheduled-campaign jobs without running workers, sending SMS,
          mutating queue rows, or enabling provider integrations.
        </p>
      </Panel>

      <Panel title="Inbox Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/inbox">
          Inbox Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review shared inbox status, assignment counts, and recent local message metadata without creating replies,
          mutating contacts, sending notifications, calling providers, or enabling live messaging.
        </p>
      </Panel>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Numbers">
          <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/numbers">
            Provider Numbers
          </Link>
          <ul className="grid gap-3 text-sm">
            {numbers.length > 0 ? (
              numbers.map((number) => (
                <li key={number.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-950">{number.phoneNumber}</span>
                  <span className="text-slate-600">{number.status}</span>
                </li>
              ))
            ) : (
              <li className="text-slate-600">No numbers configured.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Blockers">
          <ul className="grid gap-2 text-sm text-slate-700">
            {providerSettings.blockers.length > 0 ? (
              providerSettings.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)
            ) : (
              <li>No blockers recorded.</li>
            )}
          </ul>
        </Panel>
      </section>

      <Panel title="Readiness Audit">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <nav aria-label="Readiness audit filters" className="flex flex-wrap gap-2">
            <FilterLink href="/settings" label="All" active={!selectedAuditAction} />
            {readinessAuditActions.map((action) => (
              <FilterLink key={action} href={`/settings?auditAction=${action}`} label={action} active={selectedAuditAction === action} />
            ))}
          </nav>
          <Link
            className="text-sm font-medium text-teal-700"
            href={`/api/settings/readiness-audit/export?limit=200${selectedAuditAction ? `&action=${selectedAuditAction}` : ""}`}
          >
            Export CSV
          </Link>
        </div>
        <ul className="grid gap-3 text-sm">
          {auditEvents.length > 0 ? (
            auditEvents.map((event) => (
              <li key={event.id} className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <span className="font-medium text-slate-950">
                  {event.action} / {event.subjectType}
                </span>
                <time className="text-slate-600" dateTime={event.createdAt.toISOString()}>
                  {event.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No audit events recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Credential Rotation History">
        <ul className="grid gap-3 text-sm">
          {credentialRotations.length > 0 ? (
            credentialRotations.map((rotation) => (
              <li key={rotation.id} className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <span className="font-medium text-slate-950">
                  {rotation.action} / {rotation.provider} / {rotation.fromNumberRedacted ?? "not stored"}
                </span>
                <time className="text-slate-600" dateTime={rotation.createdAt.toISOString()}>
                  {rotation.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No credential rotation history recorded.</li>
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

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      className={
        active
          ? "rounded border border-slate-950 bg-slate-950 px-3 py-1 text-xs font-semibold text-white"
          : "rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
      }
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
