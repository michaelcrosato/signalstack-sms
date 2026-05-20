import { envDefaults } from "@/lib/env/defaults";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Milestone 0
        </p>
        <h1 className="text-4xl font-semibold text-slate-950">SignalStack SMS</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-700">
          Repo scaffold for a demo-safe SMB texting SaaS. Product features are intentionally
          stubbed until contracts, validation, and hard gates are in place.
        </p>
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
