import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductContacts } from "@/lib/product/contacts";
import { productNavigation } from "@/lib/product/dashboard";
import { ContactImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const { archivedContacts, contacts, summary } = await getProductContacts(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Contacts</p>
              <h1 className="text-3xl font-semibold">Audience workspace</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Review opted-in contacts, consent state, lists, and tags before building a campaign.
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
        <section aria-label="Contact metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Active Contacts" value={summary.total} />
          <Metric label="Opted In" value={summary.optedIn} />
          <Metric label="Opted Out" value={summary.optedOut} />
          <Metric label="Unknown Consent" value={summary.unknown} />
          <Metric label="Archived" value={summary.archived} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-semibold">Contact list</h2>
              <p className="mt-1 text-sm text-slate-600">Tenant-scoped contacts from the existing contacts API model.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
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
                    <tr className="border-t border-slate-100" key={contact.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-950">{contact.displayName}</div>
                        <div className="text-slate-600">{contact.phone}</div>
                        {contact.email ? <div className="text-slate-500">{contact.email}</div> : null}
                        <Link
                          aria-label={`View ${contact.displayName}`}
                          className="mt-2 inline-flex text-xs font-semibold text-teal-700"
                          href={`/dashboard/contacts/${contact.id}`}
                        >
                          View details
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold">
                          {contact.consentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{contact.lists.join(", ") || "None"}</td>
                      <td className="px-4 py-3 text-slate-700">{contact.tags.join(", ") || "None"}</td>
                      <td className="px-4 py-3 text-slate-700">{contact.optInSource ?? contact.source ?? "Unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">CSV import</h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste demo CSV rows to create or update contacts through the existing local import endpoint.
            </p>
            <div className="mt-5">
              <ContactImportForm />
            </div>
          </section>
        </section>

        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-semibold">Archived contacts</h2>
            <p className="mt-1 text-sm text-slate-600">
              Soft-archived contacts are excluded from campaigns until restored from their detail page.
            </p>
          </div>
          {archivedContacts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Consent</th>
                    <th className="px-4 py-3">Lists</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedContacts.map((contact) => (
                    <tr className="border-t border-slate-100" key={contact.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-950">{contact.displayName}</div>
                        <div className="text-slate-600">{contact.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold">
                          {contact.consentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{contact.lists.join(", ") || "None"}</td>
                      <td className="px-4 py-3">
                        <Link
                          aria-label={`Restore ${contact.displayName}`}
                          className="text-xs font-semibold text-teal-700"
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
            <p className="p-5 text-sm text-slate-600">No archived contacts.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
