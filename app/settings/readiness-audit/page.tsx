import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import { getReadinessAuditOperationLinks } from "@/lib/operations/operator-surfaces";
import { getReadinessAuditOperationsStatus } from "@/lib/operations/readiness-audit-operations";
import { readinessAuditQueryLimitDefault, readinessAuditQuerySchema } from "@/lib/validation/readiness-audit";

export const dynamic = "force-dynamic";

type ReadinessAuditPageProps = {
  searchParams?: Promise<{
    action?: string;
    subjectType?: string;
  }>;
};

export default async function ReadinessAuditOperationsPage({ searchParams }: ReadinessAuditPageProps) {
  const readinessAuditStatus = getReadinessAuditOperationsStatus();
  const params = await searchParams;
  const parsedQuery = readinessAuditQuerySchema.safeParse({
    action: params?.action,
    subjectType: params?.subjectType,
    limit: readinessAuditStatus.defaultLimit
  });
  const query = parsedQuery.success ? parsedQuery.data : { limit: readinessAuditQueryLimitDefault };
  const currentOrg = await getOrCreateCurrentOrg();
  const auditEvents = await listLiveReadinessAuditEvents(currentOrg.orgId, query.limit, {
    action: query.action,
    subjectType: query.subjectType
  });
  const exportHref = `/api/settings/readiness-audit/export?limit=${readinessAuditStatus.exportLimit}${query.action ? `&action=${query.action}` : ""}${
    query.subjectType ? `&subjectType=${query.subjectType}` : ""
  }`;
  const operationLinks = getReadinessAuditOperationLinks();

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
          <h1 className="text-4xl font-semibold text-slate-950">Readiness Audit</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local go-live readiness audit review for {currentOrg.orgName}. This page lists tenant-scoped
            configuration history and CSV links without mutating records, exposing secrets, calling providers, sending
            notifications, creating billing records, or enabling live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Recent events" value={String(auditEvents.length)} />
        <Metric label="Action filter" value={query.action ?? "all"} />
        <Metric label="Subject filter" value={query.subjectType ?? "all"} />
        <Metric label="Command execution" value={readinessAuditStatus.commandExecution} />
        <Metric label="External impact" value={readinessAuditStatus.externalImpact} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Action Filters">
          <nav aria-label="Readiness audit action filters" className="flex flex-wrap gap-2">
            <FilterLink href={query.subjectType ? `/settings/readiness-audit?subjectType=${query.subjectType}` : "/settings/readiness-audit"} label="All" active={!query.action} />
            {readinessAuditStatus.actions.map((action) => (
              <FilterLink
                key={action}
                href={`/settings/readiness-audit?action=${action}${query.subjectType ? `&subjectType=${query.subjectType}` : ""}`}
                label={action}
                active={query.action === action}
              />
            ))}
          </nav>
        </Panel>

        <Panel title="Subject Filters">
          <nav aria-label="Readiness audit subject filters" className="flex flex-wrap gap-2">
            <FilterLink href={query.action ? `/settings/readiness-audit?action=${query.action}` : "/settings/readiness-audit"} label="All" active={!query.subjectType} />
            {readinessAuditStatus.subjectTypes.map((subjectType) => (
              <FilterLink
                key={subjectType}
                href={`/settings/readiness-audit?subjectType=${subjectType}${query.action ? `&action=${query.action}` : ""}`}
                label={subjectType}
                active={query.subjectType === subjectType}
              />
            ))}
          </nav>
        </Panel>
      </section>

      <Panel title="Audit Events">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-600">Local metadata only. Raw credentials, token fingerprints, and provider verification results are not shown.</p>
          <Link className="text-sm font-medium text-teal-700" href={exportHref}>
            Export Audit CSV
          </Link>
        </div>
        <ul className="grid gap-3 text-sm">
          {auditEvents.length > 0 ? (
            auditEvents.map((event) => (
              <li key={event.id} className="grid gap-2 border-b border-slate-100 pb-3 lg:grid-cols-[1fr_180px_180px]">
                <div>
                  <p className="font-medium text-slate-950">
                    {event.action} / {event.subjectType}
                  </p>
                  <p className="mt-1 break-all text-slate-600">Subject ID: {event.subjectId ?? "not recorded"}</p>
                  <p className="mt-1 break-all text-slate-600">Metadata: {formatMetadata(event.metadata)}</p>
                </div>
                <span className="text-slate-600">Actor: {event.actorUserId ?? "system"}</span>
                <time className="text-slate-600" dateTime={event.createdAt.toISOString()}>
                  {event.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No readiness audit events match the selected filters.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          {readinessAuditStatus.safetyBoundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </Panel>
    </main>
  );
}

function formatMetadata(metadata: unknown) {
  if (metadata === null || metadata === undefined) {
    return "none";
  }

  return JSON.stringify(metadata);
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
