import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getAnalyticsOverview } from "@/lib/analytics/overview";
import { getUsageSummary } from "@/lib/billing/metering";
import { listCampaigns } from "@/lib/db/repositories/campaigns";
import { listContacts } from "@/lib/db/repositories/contacts";
import { listConversations } from "@/lib/db/repositories/inbox";
import { listProviderPhoneNumbers } from "@/lib/db/repositories/provider-numbers";
import { getLiveTestSmsStatus } from "@/lib/messaging/live-test-sms";
import { getDemoConsoleLinks } from "@/lib/operations/operator-surfaces";
import { LiveTestSmsForm } from "./live-test-sms-form";
import { SettingsLayout } from "@/components/layout/settings-layout";

export const dynamic = "force-dynamic";

const demoConsoleLinks = getDemoConsoleLinks();

export default async function DemoPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [contacts, campaigns, conversations, numbers, analytics, usage] =
    await Promise.all([
      listContacts(currentOrg.orgId),
      listCampaigns(currentOrg.orgId),
      listConversations(currentOrg.orgId),
      listProviderPhoneNumbers(currentOrg.orgId),
      getAnalyticsOverview(currentOrg.orgId),
      getUsageSummary(currentOrg.orgId),
    ]);
  const liveTestSmsStatus = getLiveTestSmsStatus();

  const steps = [
    "Import opted-in contacts from CSV",
    "Preflight and schedule a demo-safe campaign",
    "Capture inbound HELP and STOP replies",
    "Generate fake AI copy, replies, summaries, and lead scores",
    "Review analytics and local-only usage records",
  ];

  return (
    <SettingsLayout>
      <header className="flex flex-col gap-6 border-b border-slate-200 pb-6">
        <nav
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-teal-700"
          aria-label="Primary demo navigation"
        >
          <Link href="/">SignalStack SMS</Link>
          <Link href="/settings/demo">Demo Ops</Link>
          <Link href="/settings">Readiness</Link>
          <Link href="/settings/operations">Operations</Link>
        </nav>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase text-slate-500">
            Investor Demo
          </p>
          <h1 className="text-4xl font-semibold text-slate-950">
            SignalStack Demo Console
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-700">
            Demo-safe workspace for {currentOrg.orgName}. Live messaging, live
            billing, and live AI remain blocked.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="Contacts" value={contacts.length} />
        <Metric label="Campaigns" value={campaigns.length} />
        <Metric label="Conversations" value={conversations.length} />
        <Metric label="Messages" value={analytics.messages.total} />
        <Metric label="Numbers" value={numbers.length} />
      </section>

      <LiveTestSmsForm
        enabled={liveTestSmsStatus.enabled}
        blockers={liveTestSmsStatus.blockers}
        allowedRecipients={liveTestSmsStatus.allowedRecipients}
        fromNumber={liveTestSmsStatus.fromNumber}
      />

      <section
        className="border-y border-slate-200 py-5"
        aria-label="Demo console operations"
      >
        <div className="mb-3 flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase text-slate-500">
            Operator Surfaces
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            Read-only local views for validating the demo, safety gates, and
            operations inventory.
          </p>
        </div>
        <nav className="grid gap-2 text-sm font-medium text-teal-700 sm:grid-cols-2 lg:grid-cols-4">
          {demoConsoleLinks.map((link) => (
            <Link
              key={link.href}
              className="border-l border-slate-200 pl-3 leading-6 transition hover:text-teal-900"
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold text-slate-950">Demo Path</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-700">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-teal-700 text-xs font-semibold text-teal-700">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold text-slate-950">Safety Gates</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <StatusRow
              label="Messaging provider"
              value={process.env.MESSAGING_PROVIDER ?? "dummy"}
            />
            <StatusRow
              label="Live messaging"
              value={process.env.LIVE_MESSAGING_ENABLED ?? "false"}
            />
            <StatusRow
              label="Live billing"
              value={process.env.LIVE_BILLING_ENABLED ?? "false"}
            />
            <StatusRow
              label="AI provider"
              value={process.env.AI_PROVIDER ?? "fake"}
            />
            <StatusRow
              label="Billing blocked"
              value={String(usage.liveBillingBlocked)}
            />
          </dl>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Latest Contacts"
          items={contacts.slice(0, 4).map((contact) => ({
            id: contact.id,
            label: contact.displayName ?? contact.phone,
          }))}
        />
        <Panel
          title="Campaigns"
          items={campaigns.slice(0, 4).map((campaign) => ({
            id: campaign.id,
            label: `${campaign.name} (${campaign.status})`,
          }))}
        />
        <Panel
          title="Numbers"
          items={numbers.slice(0, 4).map((number) => ({
            id: number.id,
            label: `${number.phoneNumber} (${number.provider})`,
          }))}
        />
        <Panel
          title="Inbox"
          items={conversations.slice(0, 4).map((conversation) => {
            const contact =
              conversation.contact?.displayName ??
              conversation.contact?.phone ??
              "Unknown contact";
            return {
              id: conversation.id,
              label: `${contact} (${conversation.status})`,
            };
          })}
        />
      </section>
    </SettingsLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-950">{value}</dd>
    </div>
  );
}

function Panel({
  title,
  items,
}: {
  title: string;
  items: { id: string; label: string }[];
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {items.length > 0 ? (
          items.map((item) => <li key={item.id}>{item.label}</li>)
        ) : (
          <li>No demo records yet.</li>
        )}
      </ul>
    </div>
  );
}
