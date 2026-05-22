import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";
import { getDeliveryOperationsStatus } from "@/lib/operations/delivery-operations";
import { getDeliveryOperationLinks } from "@/lib/operations/operator-surfaces";

export const dynamic = "force-dynamic";

export default async function DeliveryOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const operationLinks = getDeliveryOperationLinks();
  const deliveryStatus = getDeliveryOperationsStatus();
  const messages = await prisma.message.findMany({
    where: { orgId: currentOrg.orgId },
    include: {
      campaign: { select: { name: true, status: true } },
      contact: { select: { displayName: true, phone: true } },
      conversation: { select: { status: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 30
  });

  const outboundMessages = messages.filter((message) => message.direction === "OUTBOUND");
  const inboundMessages = messages.filter((message) => message.direction === "INBOUND");
  const deliveredMessages = messages.filter((message) => message.deliveredAt !== null);
  const failedMessages = messages.filter((message) => message.failedAt !== null || message.providerStatus === "failed");
  const providerStatuses = Array.from(new Set(messages.map((message) => message.providerStatus ?? "local_only")));

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
          <h1 className="text-4xl font-semibold text-slate-950">Delivery Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local delivery review for {currentOrg.orgName}. This page displays existing message status
            metadata only; it does not send SMS, retry deliveries, replay webhooks, mutate messages, call providers,
            create billing records, send notifications, expose secrets, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Messages" value={String(messages.length)} />
        <Metric label="Outbound" value={String(outboundMessages.length)} />
        <Metric label="Delivered" value={String(deliveredMessages.length)} />
        <Metric label="Failed" value={String(failedMessages.length)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Direction Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Inbound" value={String(inboundMessages.length)} />
            <StatusRow label="Outbound" value={String(outboundMessages.length)} />
            <StatusRow label="Provider statuses" value={providerStatuses.join(", ")} />
            <StatusRow label="Retry controls" value="not available" />
          </dl>
        </Panel>

        <Panel title="Delivery Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Delivered" value={String(deliveredMessages.length)} />
            <StatusRow label="Failed" value={String(failedMessages.length)} />
            <StatusRow label="With provider ID" value={String(messages.filter((message) => message.providerMessageId).length)} />
            <StatusRow label="Provider calls" value="none from this view" />
            <StatusRow label="Command execution" value={deliveryStatus.commandExecution} />
            <StatusRow label="External impact" value={deliveryStatus.externalImpact} />
            <StatusRow label="Mutation" value={deliveryStatus.mutation} />
            <StatusRow label="Secrets displayed" value={String(deliveryStatus.secretsDisplayed)} />
          </dl>
        </Panel>
      </section>

      <Panel title="Delivery Checkpoints">
        <ul className="grid gap-3 text-sm">
          {deliveryStatus.checkpoints.map((checkpoint) => (
            <li key={checkpoint.name} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[160px_140px_1fr]">
              <span className="font-medium text-slate-950">{checkpoint.name}</span>
              <span className="text-slate-600">{checkpoint.status}</span>
              <span className="text-slate-700">{checkpoint.boundary}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Recent Messages">
        <ul className="grid gap-3 text-sm">
          {messages.length > 0 ? (
            messages.map((message) => (
              <li key={message.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">
                    {message.direction} / {message.providerStatus ?? "local_only"} /{" "}
                    {message.campaign?.name ?? message.conversation?.status ?? "local message"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {message.contact?.displayName ?? message.contact?.phone ?? "Unknown contact"} /{" "}
                    {message.providerMessageId ?? "no provider id"} / {message.idempotencyKey}
                  </p>
                </div>
                <time className="text-slate-600" dateTime={message.createdAt.toISOString()}>
                  {message.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No local messages recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          {deliveryStatus.safetyBoundaries.map((boundary) => (
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
