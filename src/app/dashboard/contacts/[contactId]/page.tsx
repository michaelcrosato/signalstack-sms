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
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Contact Detail</p>
              <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">{contact.displayName}</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Update local profile, consent evidence, notes, tags, and lists before using this contact in campaign
                preflight.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/dashboard/contacts">
                Contacts
              </Link>
              <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10 transition duration-200" href="/dashboard">
                Dashboard
              </Link>
            </div>
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

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_0.55fr]">
        <section className="glass-card p-6">
          <h2 className="text-xl font-bold font-display text-white">Profile and consent</h2>
          <p className="mt-1.5 text-xs text-slate-400">
            Changes use the existing tenant-scoped contact API. Archive is a soft archive only.
          </p>
          <div className="mt-5">
            <ContactDetailForm contact={contact} />
          </div>
        </section>

        <aside className="grid content-start gap-6">
          <section aria-label="Contact status" className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">Contact status</h2>
            <dl className="mt-4 grid gap-3.5 text-sm">
              {contact.statusRows.map((row) => (
                <StatusRow key={row.key} label={row.label} value={row.value} />
              ))}
            </dl>
          </section>

          <section className="glass-card p-6">
            <h2 className="text-xl font-bold font-display text-white">Safety Boundary</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">
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
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2.5">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="max-w-52 text-right text-sm font-semibold text-slate-200">{value}</dd>
    </div>
  );
}
