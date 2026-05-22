import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";
import { getTemplateOperationLinks } from "@/lib/operations/operator-surfaces";

export const dynamic = "force-dynamic";

const operationLinks = getTemplateOperationLinks();

export default async function TemplateOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const templates = await prisma.messageTemplate.findMany({
    where: { orgId: currentOrg.orgId },
    include: { _count: { select: { campaigns: true } } },
    orderBy: { updatedAt: "desc" },
    take: 24
  });
  const variableNames = [...new Set(templates.flatMap((template) => normalizeVariables(template.variables)))].sort();
  const campaignUsage = templates.reduce((total, template) => total + template._count.campaigns, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
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
          <h1 className="text-4xl font-semibold text-slate-950">Template Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only message template review for {currentOrg.orgName}. This page does not create templates, update copy,
            render live messages, schedule campaigns, call providers, send notifications, send SMS, expose secrets, or
            enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Templates" value={String(templates.length)} />
        <Metric label="Variables" value={String(variableNames.length)} />
        <Metric label="Campaign usage" value={String(campaignUsage)} />
        <Metric label="Live sends" value="blocked" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Variable Coverage">
          <ul className="grid gap-2 text-sm text-slate-700">
            {variableNames.length > 0 ? (
              variableNames.map((variable) => <li key={variable}>{variable}</li>)
            ) : (
              <li>No template variables recorded.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Safety Boundary">
          <ul className="grid gap-2 text-sm text-slate-700">
            <li>Templates are local database rows only from this view.</li>
            <li>Campaign creation and scheduling remain separate preflight-gated API actions.</li>
            <li>Template rendering here is limited to text previews.</li>
            <li>No provider calls, billing records, notifications, live SMS, or mutations are created.</li>
          </ul>
        </Panel>
      </section>

      <Panel title="Recent Templates">
        <ul className="grid gap-3 text-sm">
          {templates.length > 0 ? (
            templates.map((template) => {
              const variables = normalizeVariables(template.variables);
              return (
                <li key={template.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-medium text-slate-950">{template.name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{template.body}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Variables: {variables.length > 0 ? variables.join(", ") : "none"}
                    </p>
                  </div>
                  <span className="text-slate-600">{template._count.campaigns} campaigns</span>
                </li>
              );
            })
          ) : (
            <li className="text-slate-600">No templates recorded.</li>
          )}
        </ul>
      </Panel>
    </main>
  );
}

function normalizeVariables(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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


