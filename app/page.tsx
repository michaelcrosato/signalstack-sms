import Link from "next/link";
import { envDefaults } from "@/lib/env/defaults";
import { getLaunchDashboardLinks } from "@/lib/operations/operator-surfaces";

const launchLinks = getLaunchDashboardLinks();

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <section className="space-y-4 border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Self-hosted messaging platform
        </p>
        <h1 className="text-4xl font-semibold text-slate-950">SignalStack SMS</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-700">
          Operate contacts, conversations, campaigns, compliance, and software integrations from
          infrastructure you control. Fresh installations remain unable to send live traffic until
          an owner explicitly completes provider and readiness setup.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link className="rounded bg-teal-700 px-4 py-2.5 font-semibold text-white" href="/login">
            Sign in
          </Link>
          <Link className="rounded border border-slate-300 px-4 py-2.5 font-semibold text-slate-800" href="/setup">
            First-run setup
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Local views">
        <Link
          className="rounded border border-teal-700 bg-white p-5 transition hover:border-slate-950"
          href="/dashboard"
        >
          <span className="text-lg font-semibold text-slate-950">Messaging workspace</span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Work from the product-facing contacts, campaigns, inbox, analytics, and compliance shell.
          </span>
        </Link>
        {launchLinks.map((item) => (
          <Link
            key={item.href}
            className="rounded border border-slate-200 bg-white p-5 transition hover:border-teal-700"
            href={item.href}
          >
            <span className="text-lg font-semibold text-slate-950">{item.label}</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{item.note}</span>
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
