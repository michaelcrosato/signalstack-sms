import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductContacts } from "@/lib/product/contacts";
import { productNavigation } from "@/lib/product/dashboard";
import { ContactImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const { archivedContacts, contacts, metrics } = await getProductContacts(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Contacts</p>
              <h1 className="text-3xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Audience workspace</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Review opted-in contacts, consent state, lists, and tags before building a campaign.
              </p>
            </div>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition duration-200" href="/dashboard">
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
        <section aria-label="Contact metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-card overflow-hidden">
            <div className="border-b border-white/5 p-5">
              <h2 className="text-xl font-bold font-display text-white">Contact list</h2>
              <p className="mt-1 text-xs text-slate-400">Tenant-scoped contacts from the existing contacts API model.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300 font-display">
                  <tr>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Consent</th>
                    <th className="px-4 py-3">Lists</th>
                    <th className="px-4 py-3">Tags</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr className="border-t border-white/5 hover:bg-white/5 transition duration-150" key={contact.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{contact.displayName}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{contact.phone}</div>
                        {contact.email ? <div className="text-xs text-slate-500 mt-0.5">{contact.email}</div> : null}
                        <Link
                          aria-label={`View ${contact.displayName}`}
                          className="mt-2.5 inline-flex text-xs font-semibold text-teal-400 hover:text-teal-300 transition duration-150"
                          href={`/dashboard/contacts/${contact.id}`}
                        >
                          View details
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-white/10 bg-slate-900/60 px-2 py-1 text-xs font-semibold text-slate-300">
                          {contact.consentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">{contact.lists.join(", ") || "None"}</td>
                      <td className="px-4 py-3 text-xs text-slate-300">{contact.tags.join(", ") || "None"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{contact.optInSource ?? contact.source ?? "Unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <section className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">CSV import</h2>
            <p className="mt-1 text-xs text-slate-400">
              Paste demo CSV rows to create or update contacts through the existing local import endpoint.
            </p>
            <div className="mt-5">
              <ContactImportForm />
            </div>
          </section>
        </section>

        <section className="glass-card overflow-hidden">
          <div className="border-b border-white/5 p-5">
            <h2 className="text-xl font-bold font-display text-white">Archived contacts</h2>
            <p className="mt-1 text-xs text-slate-400">
              Soft-archived contacts are excluded from campaigns until restored from their detail page.
            </p>
          </div>
          {archivedContacts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300 font-display">
                  <tr>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Consent</th>
                    <th className="px-4 py-3">Lists</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedContacts.map((contact) => (
                    <tr className="border-t border-white/5 hover:bg-white/5 transition duration-150" key={contact.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{contact.displayName}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{contact.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-white/10 bg-slate-900/60 px-2 py-1 text-xs font-semibold text-slate-300">
                          {contact.consentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">{contact.lists.join(", ") || "None"}</td>
                      <td className="px-4 py-3">
                        <Link
                          aria-label={`Restore ${contact.displayName}`}
                          className="text-xs font-semibold text-teal-400 hover:text-teal-300 transition duration-150"
                          href={`/dashboard/contacts/${contact.id}`}
                        >
                          Restore from details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-slate-500">No archived contacts.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-extrabold font-display text-white glow-text">{value}</p>
    </div>
  );
}
