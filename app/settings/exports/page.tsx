import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import { getExportOperationLinks } from "@/lib/operations/operator-surfaces";
import { buildReadinessAuditExportHref } from "@/lib/operations/readiness-audit-operations";

export const dynamic = "force-dynamic";

export default async function SettingsExportsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const operationLinks = getExportOperationLinks();
  const [auditEvents, credentialRotations] = await Promise.all([
    listLiveReadinessAuditEvents(currentOrg.orgId, 5),
    listProviderCredentialRotations(currentOrg.orgId, "twilio", 5)
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Admin Exports</h1>
        </div>
      </header>

      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Export Operations</h2>
        <nav aria-label="Admin export operations" className="mt-4 grid gap-2 md:grid-cols-3">
          {operationLinks.map((link) => (
            <Link key={link.href} className="rounded border border-slate-200 p-3 text-sm font-medium text-teal-700" href={link.href}>
              <span>{link.label}</span>
              <span className="mt-1 block text-xs font-normal text-slate-600">{link.note}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <ExportPanel
          title="Readiness Audit"
          count={auditEvents.length}
          description="Local go-live readiness audit events with action, subject, actor, timestamp, and metadata columns."
          href={buildReadinessAuditExportHref()}
          detailHref="/settings/readiness-audit"
        />
        <ExportPanel
          title="Provider Credential Rotations"
          count={credentialRotations.length}
          description="Redacted local Twilio credential metadata history with no raw token or fingerprint columns."
          href="/api/settings/provider/rotations/export?limit=50"
        />
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Export Safety Boundary</h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <StatusRow label="Live messaging" value="blocked" />
          <StatusRow label="Provider calls" value="none" />
          <StatusRow label="Billing records" value="none" />
          <StatusRow label="Secrets" value="redacted metadata only" />
        </dl>
      </section>
    </main>
  );
}

function ExportPanel({ title, count, description, href, detailHref }: { title: string; count: number; description: string; href: string; detailHref?: string }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        </div>
        <span className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">{count} recent</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link className="inline-flex rounded border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-700" href={href}>
          Export CSV
        </Link>
        {detailHref ? (
          <Link className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" href={detailHref}>
            Review Events
          </Link>
        ) : null}
      </div>
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
