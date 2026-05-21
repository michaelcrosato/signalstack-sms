import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { productNavigation } from "@/lib/product/dashboard";
import { getProductTemplates } from "@/lib/product/templates";
import { TemplateForm } from "./template-form";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const { summary, templates, variableNames } = await getProductTemplates(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Templates</p>
              <h1 className="text-3xl font-semibold">Template workspace</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Create reusable SMS copy, review variables, and see where templates are used without rendering live outbound
                messages or sending provider traffic.
              </p>
            </div>
            <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" href="/dashboard">
              Dashboard
            </Link>
          </div>
          <nav aria-label="Product areas" className="flex gap-2 overflow-x-auto pb-1">
            {productNavigation.map((item) => (
              <Link
                key={item.href}
                className="min-w-fit rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6">
        <section aria-label="Template metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Saved Templates" value={summary.total} />
          <Metric label="Variables" value={summary.variables} />
          <Metric label="Campaign Usage" value={summary.campaignUsage} />
          <Metric label="Live Sends" value="blocked" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">Template editor</h2>
            <p className="mt-1 text-sm text-slate-600">Saving uses the existing local template API and upserts by name.</p>
            <div className="mt-5">
              <TemplateForm />
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-semibold">Saved templates</h2>
              <p className="mt-1 text-sm text-slate-600">Reusable local copy for campaign drafts.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Variables</th>
                    <th className="px-4 py-3">Campaigns</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr className="border-t border-slate-100 align-top" key={template.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-950">{template.name}</div>
                        <div className="mt-1 max-w-xl text-slate-600">{template.body}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {template.variables.length > 0 ? template.variables.join(", ") : "none"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{template.campaignUsage}</td>
                      <td className="px-4 py-3 text-slate-700">{template.updatedAt.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Variable Library">
            <p className="text-sm leading-6 text-slate-700">
              {variableNames.length > 0 ? variableNames.join(", ") : "No variables recorded yet."}
            </p>
          </Panel>
          <Panel title="Safety Boundary">
            <ul className="grid gap-2 text-sm text-slate-700">
              <li>Template saves are local database mutations only.</li>
              <li>Campaign preflight remains the gate for consent and opted-out recipients.</li>
              <li>No provider calls, SMS, live AI requests, billing records, or live feature enablement occur here.</li>
            </ul>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
