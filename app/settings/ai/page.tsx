import { UsageEventType } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getUsageSummary } from "@/lib/billing/metering";
import { getAiOperationLinks } from "@/lib/operations/operator-surfaces";

export const dynamic = "force-dynamic";

const aiEndpoints = [
  "/api/ai/campaign-copy",
  "/api/ai/reply-suggestion",
  "/api/ai/conversation-summary",
  "/api/ai/lead-qualification"
];
const operationLinks = getAiOperationLinks();

export default async function AiOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const usage = await getUsageSummary(currentOrg.orgId);
  const aiEvents = usage.recentEvents.filter((event) => event.type === UsageEventType.AI_REQUEST);
  const aiProvider = process.env.AI_PROVIDER ?? "fake";
  const fakeAiActive = aiProvider === "fake";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          {operationLinks.map((link) => (
            <Link key={link.href} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">AI Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only local AI boundary for {currentOrg.orgName}. This page shows fake-provider readiness and local AI
            usage records only; it does not call live AI, create prompts, mutate conversations, send notifications, call
            providers, create billing artifacts, or expose secrets.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="AI provider" value={aiProvider} />
        <Metric label="Fake AI active" value={String(fakeAiActive)} />
        <Metric label="Live AI blocked" value={String(!fakeAiActive)} />
        <Metric label="AI usage quantity" value={String(usage.totals[UsageEventType.AI_REQUEST])} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Provider Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Configured provider" value={aiProvider} />
            <StatusRow label="Allowed local provider" value="fake" />
            <StatusRow label="Fake outputs deterministic" value={String(fakeAiActive)} />
            <StatusRow label="Live AI calls" value="blocked" />
            <StatusRow label="API keys displayed" value="false" />
          </dl>
        </Panel>

        <Panel title="Available AI Endpoints">
          <ul className="grid gap-2 text-sm text-slate-700">
            {aiEndpoints.map((endpoint) => (
              <li key={endpoint} className="break-words border-b border-slate-100 pb-2 font-mono text-xs text-slate-800">
                {endpoint}
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>AI endpoints remain deterministic under the fake provider.</li>
          <li>Provider values other than fake are blocked by existing AI endpoint gates.</li>
          <li>This view does not submit prompts, summarize conversations, qualify leads, or write usage events.</li>
          <li>No live AI, paid model calls, provider calls, billing records, notifications, live SMS, or secrets are created.</li>
        </ul>
      </Panel>

      <Panel title="Recent AI Usage">
        <ul className="grid gap-3 text-sm">
          {aiEvents.length > 0 ? (
            aiEvents.slice(0, 20).map((event) => (
              <li key={event.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">AI Request x {event.quantity}</p>
                  <p className="mt-1 break-words text-xs text-slate-600">{formatMetadata(event.metadata)}</p>
                </div>
                <time className="text-slate-600" dateTime={event.createdAt.toISOString()}>
                  {event.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No local AI usage events recorded.</li>
          )}
        </ul>
      </Panel>
    </main>
  );
}

function formatMetadata(metadata: unknown) {
  if (!metadata) {
    return "metadata: none";
  }

  return `metadata: ${JSON.stringify(metadata)}`;
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


