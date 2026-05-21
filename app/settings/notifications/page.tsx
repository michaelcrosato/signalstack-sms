import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getNotificationOperationsStatus } from "@/lib/operations/notification-operations";
import { getNotificationOperationLinks } from "@/lib/operations/operator-surfaces";
import { getSystemStatus } from "@/lib/operations/system-status";

export const dynamic = "force-dynamic";

export default async function NotificationOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const status = getSystemStatus(process.env);
  const notificationStatus = getNotificationOperationsStatus();
  const operationLinks = getNotificationOperationLinks();

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
          <h1 className="text-4xl font-semibold text-slate-950">Notification Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only notification boundary review for {currentOrg.orgName}. This page does not send email, SMS alerts,
            browser notifications, webhooks, billing messages, provider calls, or live operational alerts.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="External impact" value={status.safety.externalImpactBlocked ? "blocked" : "review"} />
        <Metric label="Live SMS" value={String(status.safety.liveMessagingEnabled)} />
        <Metric label="Live billing" value={String(status.safety.liveBillingEnabled)} />
        <Metric label="Provider" value={status.safety.messagingProvider} />
      </section>

      <Panel title="Channel Boundaries">
        <ul className="grid gap-3 text-sm">
          {notificationStatus.channels.map((channel) => (
            <li key={channel.name} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[180px_140px_1fr]">
              <span className="font-medium text-slate-950">{channel.name}</span>
              <span className="text-slate-600">{channel.status}</span>
              <span className="text-slate-700">{channel.boundary}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Runtime Controls">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Demo mode" value={String(status.safety.demoMode)} />
            <StatusRow label="Messaging provider" value={status.safety.messagingProvider} />
            <StatusRow label="AI provider" value={status.safety.aiProvider} />
            <StatusRow label="Production override" value={String(status.deployment.productionExternalOverride)} />
          </dl>
        </Panel>

        <Panel title="No-Send Controls">
          <ul className="grid gap-2 text-sm text-slate-700">
            {notificationStatus.controls.map((control) => (
              <li key={control}>{control}</li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          {notificationStatus.safetyBoundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </Panel>
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-950">{value}</dd>
    </div>
  );
}
