import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";
import { getWebhookOperationLinks } from "@/lib/operations/operator-surfaces";

export const dynamic = "force-dynamic";

const webhookRoutes = [
  {
    label: "Twilio inbound",
    path: "/api/webhooks/twilio/inbound",
    behavior: "stores raw payloads and creates local inbound inbox messages"
  },
  {
    label: "Twilio status",
    path: "/api/webhooks/twilio/status",
    behavior: "stores raw payloads and updates matching local delivery metadata"
  }
];

export default async function WebhookOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const operationLinks = getWebhookOperationLinks();
  const events = await prisma.webhookEvent.findMany({
    where: { orgId: currentOrg.orgId },
    orderBy: { receivedAt: "desc" },
    take: 30
  });
  const providers = new Set(events.map((event) => event.provider));
  const processedEvents = events.filter((event) => event.processedAt !== null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        {operationLinks.map((link) => (
          <Link key={link.href} className="text-sm font-medium text-teal-700" href={link.href}>
            {link.label}
          </Link>
        ))}
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Webhook Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local webhook review for {currentOrg.orgName}. This page displays stored webhook metadata and route
            coverage only; it does not replay webhooks, call Twilio, send replies, mutate provider state, send
            notifications, create billing artifacts, expose secrets, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Stored events" value={String(events.length)} />
        <Metric label="Processed" value={String(processedEvents.length)} />
        <Metric label="Providers" value={String(providers.size)} />
        <Metric label="Webhook routes" value={String(webhookRoutes.length)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Route Coverage">
          <ul className="grid gap-3 text-sm">
            {webhookRoutes.map((route) => (
              <li key={route.path} className="border-b border-slate-100 pb-3">
                <p className="font-medium text-slate-950">{route.label}</p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800">{route.path}</p>
                <p className="mt-1 text-xs text-slate-600">{route.behavior}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Event Types">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Inbound message" value={String(countEvents(events, "inbound"))} />
            <StatusRow label="Delivery status" value={String(countEvents(events, "status"))} />
            <StatusRow label="Provider" value={providers.size > 0 ? Array.from(providers).join(", ") : "none recorded"} />
            <StatusRow label="Replay controls" value="not available" />
          </dl>
        </Panel>
      </section>

      <Panel title="Recent Webhook Events">
        <ul className="grid gap-3 text-sm">
          {events.length > 0 ? (
            events.map((event) => (
              <li key={event.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">
                    {event.provider} / {event.eventType}
                  </p>
                  <p className="mt-1 break-words text-xs text-slate-600">{event.idempotencyKey}</p>
                </div>
                <time className="text-slate-600" dateTime={event.receivedAt.toISOString()}>
                  {event.receivedAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No local webhook events recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>Webhook signature validation remains in the API handlers, not this view.</li>
          <li>Inbound and status callbacks remain idempotent through stored local keys.</li>
          <li>This page cannot replay provider payloads or trigger outbound messages.</li>
          <li>No provider calls, notifications, billing records, live SMS, mutations, or secrets are created.</li>
        </ul>
      </Panel>
    </main>
  );
}

function countEvents(events: Awaited<ReturnType<typeof prisma.webhookEvent.findMany>>, eventType: string) {
  return events.filter((event) => event.eventType === eventType).length;
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
