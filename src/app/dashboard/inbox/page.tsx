import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { productNavigation } from "@/lib/product/dashboard";
import { getProductInbox } from "@/lib/product/inbox";
import { InboxWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams?: Promise<{
    conversationId?: string | string[];
  }>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const params = await searchParams;
  const selectedConversationId = firstQueryValue(params?.conversationId);
  const currentOrg = await getOrCreateCurrentOrg();
  const inbox = await getProductInbox(currentOrg.orgId, selectedConversationId);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 font-display glow-text">Inbox</p>
              <h1 className="text-3xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Inbox workspace</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                Review local conversation threads, simulate inbound replies, add internal notes, assign ownership, and
                resolve work without provider sends.
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
        <section aria-label="Inbox metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {inbox.metrics.map((metric) => (
            <Metric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </section>

        <InboxWorkspace
          key={inbox.selectedConversation?.id ?? "none"}
          conversations={inbox.conversations}
          currentUserId={currentOrg.userId}
          selectedConversation={inbox.selectedConversation}
        />
      </div>
    </main>
  );
}

function firstQueryValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-extrabold font-display text-white glow-text">{value}</p>
    </div>
  );
}
