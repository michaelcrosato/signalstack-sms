import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { productNavigation } from "@/lib/product/dashboard";
import { getProductInbox } from "@/lib/product/inbox";
import { InboxWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const inbox = await getProductInbox(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Inbox</p>
              <h1 className="text-3xl font-semibold">Inbox workspace</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Review local conversation threads, simulate inbound replies, add internal notes, assign ownership, and
                resolve work without provider sends.
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
        <section aria-label="Inbox metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total Threads" value={inbox.summary.total} />
          <Metric label="Open Threads" value={inbox.summary.open} />
          <Metric label="Resolved Threads" value={inbox.summary.resolved} />
          <Metric label="Recent Inbound" value={inbox.summary.inboundMessages} />
        </section>

        <InboxWorkspace
          conversations={inbox.conversations}
          currentUserId={currentOrg.userId}
          selectedConversation={inbox.selectedConversation}
        />
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
