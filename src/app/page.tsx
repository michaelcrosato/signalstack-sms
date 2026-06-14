import Link from "next/link";
import { envDefaults } from "@/lib/env/defaults";
import { getLaunchDashboardLinks } from "@/lib/operations/operator-surfaces";

const launchLinks = getLaunchDashboardLinks();

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <section className="space-y-4 border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Local Launch Dashboard
        </p>
        <h1 className="text-4xl font-semibold text-slate-950">SignalStack SMS</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-700">
          Demo-safe command center for the local SMB texting SaaS implementation. Live messaging,
          billing, provider calls, notifications, and live AI remain blocked by default.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Local views">
        <Link
          className="rounded border border-teal-700 bg-white p-5 transition hover:border-slate-950"
          href="/dashboard"
        >
          <span className="text-lg font-semibold text-slate-950">Product Dashboard</span>
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
