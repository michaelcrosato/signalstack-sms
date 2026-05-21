import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductContactDetail } from "@/lib/product/contacts";
import { productNavigation } from "@/lib/product/dashboard";
import { ContactDetailForm } from "./contact-detail-form";

type ContactDetailPageProps = {
  params: Promise<{ contactId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({ params }: ContactDetailPageProps) {
  const [{ contactId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const contact = await getProductContactDetail(currentOrg.orgId, contactId);

  if (!contact) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Contact Detail</p>
              <h1 className="text-3xl font-semibold">{contact.displayName}</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Update local profile, consent evidence, notes, tags, and lists before using this contact in campaign
                preflight.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link className="rounded border border-slate-300 px-3 py-2 font-medium text-slate-700" href="/dashboard/contacts">
                Contacts
              </Link>
              <Link className="rounded border border-slate-300 px-3 py-2 font-medium text-slate-700" href="/dashboard">
                Dashboard
              </Link>
            </div>
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

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_0.55fr]">
        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold">Profile and consent</h2>
          <p className="mt-1 text-sm text-slate-600">
            Changes use the existing tenant-scoped contact API. Archive is a soft archive only.
          </p>
          <div className="mt-5">
            <ContactDetailForm contact={contact} />
          </div>
        </section>

        <aside className="grid content-start gap-6">
          <section aria-label="Contact status" className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">Contact status</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <StatusRow label="Phone" value={contact.phone} />
              <StatusRow label="Consent" value={contact.consentStatus} />
              <StatusRow label="Lists" value={contact.lists.join(", ") || "None"} />
              <StatusRow label="Tags" value={contact.tags.join(", ") || "None"} />
              <StatusRow label="Archived" value={contact.archived ? "yes" : "no"} />
            </dl>
          </section>

          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold">Safety Boundary</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              This page mutates local contact metadata only. It does not send SMS, call providers, create billing
              records, call live AI, expose secrets, hard-delete contacts, bypass consent checks, or enable live
              messaging.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="max-w-52 text-right font-medium text-slate-950">{value}</dd>
    </div>
  );
}
