import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listProviderPhoneNumbers } from "@/lib/db/repositories/provider-numbers";
import { getNumberOperationLinks } from "@/lib/operations/operator-surfaces";

export const dynamic = "force-dynamic";

export default async function ProviderNumbersPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const numbers = await listProviderPhoneNumbers(currentOrg.orgId);
  const defaultNumber = numbers.find((number) => number.isDefault);
  const providerCount = new Set(numbers.map((number) => number.provider)).size;
  const operationLinks = getNumberOperationLinks();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        {operationLinks.map((link) => (
          <Link key={link.href} className="text-sm font-medium text-teal-700" href={link.href}>
            {link.label}
          </Link>
        ))}
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Provider Numbers</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local phone-number metadata for {currentOrg.orgName}. These records do not prove provider
            ownership, provision numbers, call Twilio, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Numbers" value={String(numbers.length)} />
        <Metric label="Default number" value={defaultNumber?.phoneNumber ?? "not set"} />
        <Metric label="Providers" value={String(providerCount)} />
        <Metric label="Live messaging" value={process.env.LIVE_MESSAGING_ENABLED ?? "false"} />
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Number Metadata</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Number</th>
                <th className="py-2 pr-4 font-medium">Label</th>
                <th className="py-2 pr-4 font-medium">Provider</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Default</th>
                <th className="py-2 pr-4 font-medium">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {numbers.length > 0 ? (
                numbers.map((number) => (
                  <tr key={number.id} className="border-b border-slate-100 text-slate-700">
                    <td className="py-3 pr-4 font-medium text-slate-950">{number.phoneNumber}</td>
                    <td className="py-3 pr-4">{number.label ?? "not labeled"}</td>
                    <td className="py-3 pr-4">{number.provider}</td>
                    <td className="py-3 pr-4">{number.status}</td>
                    <td className="py-3 pr-4">{String(number.isDefault)}</td>
                    <td className="py-3 pr-4">{formatCapabilities(number.capabilities)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={6}>
                    No provider number metadata has been recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Safety Boundary">
          <ul className="grid gap-2 text-sm text-slate-700">
            <li>Number rows are tenant-scoped local metadata only.</li>
            <li>No provider-side provisioning or ownership verification runs from this page.</li>
            <li>Live sends remain blocked by demo-safe runtime defaults and hard gates.</li>
          </ul>
        </Panel>

        <Panel title="Related Operations">
          <nav aria-label="Related number operations" className="grid gap-2 text-sm">
            <Link className="font-medium text-teal-700" href="/settings">
              Review go-live blockers
            </Link>
            <Link className="font-medium text-teal-700" href="/settings/provider">
              Review provider metadata
            </Link>
            <Link className="font-medium text-teal-700" href="/settings/compliance">
              Review compliance detail
            </Link>
          </nav>
        </Panel>
      </section>
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

function formatCapabilities(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key)
      .join(", ");
  }

  return "not recorded";
}
