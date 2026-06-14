import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { productNavigation } from "@/lib/product/dashboard";
import { getProductTemplates } from "@/lib/product/templates";
import { TemplateForm } from "./template-form";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const { metrics, templates, variableNames } = await getProductTemplates(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Templates</p>
              <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Template workspace</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Create reusable SMS copy, review variables, and see where templates are used without rendering live outbound
                messages or sending provider traffic.
              </p>
            </div>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/dashboard">
              Dashboard
            </Link>
          </div>
          <nav aria-label="Product areas" className="flex gap-2 overflow-x-auto pb-1">
            {productNavigation.map((item) => (
              <Link
                key={item.href}
                className="min-w-fit rounded-lg border border-white/5 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition duration-200"
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6">
        <section aria-label="Template metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">Template editor</h2>
            <p className="mt-1.5 text-xs text-slate-400">Saving uses the existing local template API and upserts by name.</p>
            <div className="mt-5">
              <TemplateForm />
            </div>
          </section>

          <section className="glass-card p-6">
            <div className="border-b border-white/5 pb-4">
              <h2 className="text-xl font-bold font-display text-white">Saved templates</h2>
              <p className="mt-1.5 text-xs text-slate-400">Reusable local copy for campaign drafts.</p>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead className="border-b border-white/5 text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Template</th>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Variables</th>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Campaigns</th>
                    <th className="px-4 py-3.5 font-semibold uppercase tracking-wider">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition duration-150 align-top" key={template.id}>
                      <td className="px-4 py-4">
                        <Link className="font-bold text-teal-400 hover:text-teal-300 transition" href={`/dashboard/templates/${template.id}`}>
                          {template.name}
                        </Link>
                        <div className="mt-1.5 max-w-xl text-xs text-slate-400 leading-5">{template.body}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-300 font-mono text-[11px]">
                        {template.variables.length > 0 ? template.variables.join(", ") : "none"}
                      </td>
                      <td className="px-4 py-4 text-slate-300 font-semibold">{template.campaignUsage}</td>
                      <td className="px-4 py-4 text-slate-400 text-[11px]">{template.updatedAt.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Variable Library">
            <p className="text-xs leading-5 text-slate-300 bg-slate-900/30 border border-white/5 p-4 rounded-xl font-mono">
              {variableNames.length > 0 ? variableNames.join(", ") : "No variables recorded yet."}
            </p>
          </Panel>
          <Panel title="Safety Boundary">
            <ul className="grid gap-3 text-xs text-slate-400 leading-5">
              <li className="flex items-start gap-2">
                <span className="text-teal-400 mt-0.5">▪</span>
                <span>Template saves are local database mutations only.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-400 mt-0.5">▪</span>
                <span>Campaign preflight remains the gate for consent and opted-out recipients.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-400 mt-0.5">▪</span>
                <span>No provider calls, SMS, live AI requests, billing records, or live feature enablement occur here.</span>
              </li>
            </ul>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-extrabold font-display text-white glow-text">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-card p-6">
      <h2 className="text-xl font-bold font-display text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
