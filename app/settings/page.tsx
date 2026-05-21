import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";
import { getProviderCredential, listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";
import { listProviderPhoneNumbers } from "@/lib/db/repositories/provider-numbers";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import { getProviderSettings } from "@/lib/messaging/provider/settings";
import { getSettingsNavigationLinks } from "@/lib/operations/operator-surfaces";
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

const settingsNavigationLinks = getSettingsNavigationLinks();

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
        {settingsNavigationLinks.map((link) => (
          <Link key={link.href} className="text-sm font-medium text-teal-700" href={link.href}>
            {link.label}
          </Link>
        ))}
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

      <Panel title="Demo Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/demo">
          Demo Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review seeded demo readiness, workflow links, local metrics, and runtime gates without importing data,
          scheduling campaigns, creating messages, executing reports, calling providers, billing, notifying, exposing
          secrets, or enabling live features.
        </p>
      </Panel>

      <Panel title="Operations Index">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/operations">
          Operations Index
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review grouped local operator surfaces and safety boundaries without executing commands, inspecting files,
          calling APIs, mutating records, creating exports, calling providers, billing, notifying, exposing secrets, or enabling live features.
        </p>
      </Panel>

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
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/environment">
          Environment Operations
        </Link>
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/health">
          Health Operations
        </Link>
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/api">
          API Operations
        </Link>
        <Link className="mb-4 ml-4 inline-flex text-sm font-medium text-teal-700" href="/settings/contracts">
          Contract Operations
        </Link>
        <Link className="mb-4 ml-4 inline-flex text-sm font-medium text-teal-700" href="/settings/security">
          Security Operations
        </Link>
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <StatusRow label="Rate limit enabled" value={String(apiRateLimit.enabled)} />
          <StatusRow label="Requests" value={String(apiRateLimit.limit)} />
          <StatusRow label="Window seconds" value={String(apiRateLimit.windowMs / 1000)} />
        </dl>
      </Panel>

      <Panel title="Contract Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/contracts">
          Contract Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local contract inventory, drift controls, and validation command references without executing checks,
          scanning files, mutating records, calling providers, sending notifications, exposing secrets, or enabling live features.
        </p>
      </Panel>

      <Panel title="Validation Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/validation">
          Validation Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local gate commands, repair signals, and validation safety boundaries without executing commands,
          inspecting logs, scanning files, mutating records, exposing secrets, or enabling live features.
        </p>
      </Panel>

      <Panel title="Health Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/health">
          Health Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review the local health endpoint contract, demo-safe defaults, and runtime blockers without executing probes,
          calling APIs, mutating records, exposing secrets, notifying, billing, sending, or enabling live features.
        </p>
      </Panel>

      <Panel title="Environment Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/environment">
          Environment Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review demo-safe defaults, allowlisted configuration categories, and derived runtime status without reading
          environment files, exposing raw values or secrets, mutating configuration, calling providers, notifying, billing, sending, or enabling live features.
        </p>
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

      <Panel title="Queue Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/queue">
          Queue Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review scheduled job timing, queue status, payload validity, and worker settings without running workers,
          mutating jobs, calling Redis, calling providers, billing, sending notifications, or enabling live messaging.
        </p>
      </Panel>

      <Panel title="Contact Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/contacts">
          Contact Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review contact consent, CSV import history, tags, and lists without importing contacts, updating consent,
          mutating labels, sending notifications, calling providers, or enabling live messaging.
        </p>
      </Panel>

      <Panel title="Data Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/data">
          Data Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local tenant-scoped record totals, soft-archive state, import row totals, and retention boundaries
          without hard deletion, exports, provider calls, billing records, notifications, live messaging, or mutations.
        </p>
      </Panel>

      <Panel title="Audience Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/audience">
          Audience Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local tags, lists, and saved segment definitions without changing memberships, evaluating sends, calling
          providers, creating billing records, or enabling live messaging.
        </p>
      </Panel>

      <Panel title="Template Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/templates">
          Template Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local message template variables, campaign usage, and text previews without editing copy, rendering live
          sends, scheduling campaigns, calling providers, or enabling live messaging.
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

      <Panel title="Webhook Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/webhooks">
          Webhook Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review Twilio webhook route coverage, stored local webhook metadata, and idempotency keys without replaying
          payloads, calling providers, sending replies, creating billing records, notifications, or enabling live messaging.
        </p>
      </Panel>

      <Panel title="Delivery Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/delivery">
          Delivery Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review existing message delivery metadata and provider status counts without sending SMS, retrying delivery,
          replaying webhooks, mutating messages, billing, sending notifications, or enabling live messaging.
        </p>
      </Panel>

      <Panel title="Team Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/team">
          Team Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review organization metadata, membership roles, assigned threads, and authored notes without inviting users,
          changing roles, sending email, calling Clerk, or enabling live messaging.
        </p>
      </Panel>

      <Panel title="Billing Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/billing">
          Billing Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local billing account status, live billing blockers, Stripe placeholder presence, and usage totals
          without Stripe calls, invoices, payment collection, charges, email, or live billing.
        </p>
      </Panel>

      <Panel title="Reporting Index">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/reports">
          Reporting Index
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local reporting surfaces, tenant metrics, export links, and readiness signals without executing reports,
          creating exports, mutating records, calling providers, billing, sending notifications, exposing secrets, or enabling live features.
        </p>
      </Panel>

      <Panel title="AI Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/ai">
          AI Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review fake AI provider status, deterministic endpoint coverage, live-AI blockers, and local AI usage events
          without submitting prompts, calling live AI, creating billing artifacts, sending notifications, or exposing secrets.
        </p>
      </Panel>

      <Panel title="Notification Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/notifications">
          Notification Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review the local no-send boundary for email, SMS alerts, browser notifications, and outbound webhook-style
          alerts without creating recipients, templates, jobs, provider calls, or live notifications.
        </p>
      </Panel>

      <Panel title="Integration Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/integrations">
          Integration Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review provider, AI, billing, webhook, and notification integration boundaries without provider calls,
          prompt submission, billing artifacts, notifications, mutations, secret exposure, or live feature enablement.
        </p>
      </Panel>

      <Panel title="Workflow Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/workflows">
          Workflow Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review the local demo workflow checkpoints across audience, campaigns, queue, inbox, delivery, AI, usage,
          and reporting without executing workflow steps, mutating records, exporting data, or enabling live features.
        </p>
      </Panel>

      <Panel title="Release Operations">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/releases">
          Release Operations
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review the local release checklist, protected gate expectations, seeded demo path, and premerge boundary
          without executing commands, committing, deploying, mutating records, calling providers, billing, notifying, or enabling live features.
        </p>
      </Panel>

      <Panel title="Readiness Audit">
        <Link className="mb-4 inline-flex text-sm font-medium text-teal-700" href="/settings/readiness-audit">
          Readiness Audit
        </Link>
        <p className="text-sm leading-6 text-slate-700">
          Review local go-live readiness audit events, filters, and bounded CSV export links without mutating records,
          exposing secrets, calling providers, billing, sending notifications, or enabling live messaging.
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
