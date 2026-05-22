import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getProductDashboard, productNavigation } from "@/lib/product/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const dashboard = await getProductDashboard(currentOrg.orgId);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Product Dashboard</p>
              <h1 className="text-3xl font-semibold">SignalStack SMS</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-700">
                Daily workspace for managing contacts, campaign readiness, inbox response, templates, analytics, and
                compliance in demo-safe mode.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link className="rounded border border-slate-300 px-3 py-2 font-medium text-slate-700" href="/demo">
                Demo Console
              </Link>
              <Link className="rounded border border-teal-700 px-3 py-2 font-medium text-teal-700" href="/settings">
                Go-Live Settings
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

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6">
        <section aria-label="Product metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Active Contacts" value={dashboard.contacts.total} detail={`${dashboard.contacts.optedIn} opted in`} />
          <Metric label="Campaigns" value={dashboard.campaigns.total} detail={`${dashboard.campaigns.draft} drafts`} />
          <Metric label="Open Conversations" value={dashboard.inbox.open} detail={`${dashboard.inbox.messages} messages`} />
          <Metric label="Templates" value={dashboard.templates.total} detail="ready for campaign copy" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <ProductSection id="contacts" title="Contacts" eyebrow="Audience">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Active contacts" value={String(dashboard.contacts.total)} />
              <StatusRow label="Opted in" value={String(dashboard.contacts.optedIn)} />
              <StatusRow label="Opted out" value={String(dashboard.contacts.optedOut)} />
            </dl>
          </ProductSection>

          <ProductSection id="compliance" title="Compliance" eyebrow="Readiness">
            <dl className="grid gap-3 text-sm">
              <StatusRow
                label="Profile fields"
                value={`${dashboard.compliance.completeFields}/${dashboard.compliance.requiredFields}`}
              />
              <StatusRow label="A2P status" value={dashboard.compliance.a2pRegistrationStatus} />
              <StatusRow label="Live messaging" value="blocked by default" />
            </dl>
          </ProductSection>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <ProductSection id="campaigns" title="Campaigns" eyebrow="Marketing">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Total campaigns" value={String(dashboard.campaigns.total)} />
              <StatusRow label="Drafts" value={String(dashboard.campaigns.draft)} />
              <StatusRow label="Scheduled" value={String(dashboard.campaigns.scheduled)} />
            </dl>
          </ProductSection>

          <ProductSection id="inbox" title="Inbox" eyebrow="Response">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Open threads" value={String(dashboard.inbox.open)} />
              <StatusRow label="Local messages" value={String(dashboard.inbox.messages)} />
              <StatusRow label="Provider sends" value="disabled" />
            </dl>
          </ProductSection>

          <ProductSection id="templates" title="Templates" eyebrow="Copy">
            <dl className="grid gap-3 text-sm">
              <StatusRow label="Saved templates" value={String(dashboard.templates.total)} />
              <StatusRow label="AI provider" value="fake by default" />
              <StatusRow label="Live AI" value="blocked" />
            </dl>
          </ProductSection>
        </section>

        <ProductSection id="analytics" title="Analytics" eyebrow="Local Signals">
          <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-6">
            <StatusPill label="Consent coverage" value={`${dashboard.contacts.optedIn}/${dashboard.contacts.total}`} />
            <StatusPill label="Opt-in rate" value={`${dashboard.contacts.optedInPercent}%`} />
            <StatusPill label="Scheduled work" value={String(dashboard.campaigns.scheduled)} />
            <StatusPill label="Inbox load" value={String(dashboard.inbox.open)} />
            <StatusPill label="Fake AI requests" value={String(dashboard.usage.fakeAiRequests)} />
            <StatusPill label="Local usage events" value={String(dashboard.usage.totalEvents)} />
          </div>
        </ProductSection>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function ProductSection({
  id,
  title,
  eyebrow,
  children
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium text-slate-950">{value}</dd>
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
