import { CampaignStatus, QueueJobStatus } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listCampaigns } from "@/lib/db/repositories/campaigns";
import { prisma } from "@/lib/db/prisma";
import { getQueueBackend } from "@/lib/queue/bullmq";

export const dynamic = "force-dynamic";

export default async function CampaignOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [campaigns, queueJobs] = await Promise.all([
    listCampaigns(currentOrg.orgId),
    prisma.queueJob.findMany({
      where: { orgId: currentOrg.orgId },
      orderBy: [{ runAt: "asc" }, { createdAt: "desc" }],
      take: 20
    })
  ]);

  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === CampaignStatus.SCHEDULED);
  const queuedJobs = queueJobs.filter((job) => job.status === QueueJobStatus.QUEUED);
  const blockedRecipients = campaigns.reduce(
    (total, campaign) => total + campaign.recipients.filter((recipient) => recipient.status === "BLOCKED").length,
    0
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/usage">
          Usage & Analytics
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/queue">
          Queue Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contacts">
          Contact Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/templates">
          Template Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/audience">
          Audience Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/inbox">
          Inbox Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Campaign Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only campaign and queue review for {currentOrg.orgName}. This page does not schedule campaigns, send
            SMS, run workers, call providers, create billing records, send notifications, mutate queue rows, or enable
            live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Campaigns" value={String(campaigns.length)} />
        <Metric label="Scheduled" value={String(scheduledCampaigns.length)} />
        <Metric label="Queued jobs" value={String(queuedJobs.length)} />
        <Metric label="Queue backend" value={getQueueBackend(process.env)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Campaign Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Draft" value={String(countCampaigns(campaigns, CampaignStatus.DRAFT))} />
            <StatusRow label="Scheduled" value={String(countCampaigns(campaigns, CampaignStatus.SCHEDULED))} />
            <StatusRow label="Paused" value={String(countCampaigns(campaigns, CampaignStatus.PAUSED))} />
            <StatusRow label="Completed" value={String(countCampaigns(campaigns, CampaignStatus.COMPLETED))} />
            <StatusRow label="Blocked recipients" value={String(blockedRecipients)} />
          </dl>
        </Panel>

        <Panel title="Queue Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Queued" value={String(countJobs(queueJobs, QueueJobStatus.QUEUED))} />
            <StatusRow label="Completed" value={String(countJobs(queueJobs, QueueJobStatus.COMPLETED))} />
            <StatusRow label="Cancelled" value={String(countJobs(queueJobs, QueueJobStatus.CANCELLED))} />
            <StatusRow label="Failed" value={String(countJobs(queueJobs, QueueJobStatus.FAILED))} />
            <StatusRow label="Worker execution" value="manual local command only" />
          </dl>
        </Panel>
      </section>

      <Panel title="Recent Campaigns">
        <ul className="grid gap-3 text-sm">
          {campaigns.length > 0 ? (
            campaigns.slice(0, 12).map((campaign) => (
              <li key={campaign.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">{campaign.name}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {campaign.recipients.length} recipients / {campaign.template?.name ?? "no template"} /{" "}
                    {campaign.scheduledAt ? campaign.scheduledAt.toISOString() : "not scheduled"}
                  </p>
                </div>
                <span className="text-slate-600">{campaign.status}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No campaigns recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Recent Queue Jobs">
        <ul className="grid gap-3 text-sm">
          {queueJobs.length > 0 ? (
            queueJobs.map((job) => (
              <li key={job.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">
                    {job.type} / {job.status}
                  </p>
                  <p className="mt-1 break-words text-xs text-slate-600">{job.idempotencyKey}</p>
                </div>
                <time className="text-slate-600" dateTime={job.runAt.toISOString()}>
                  {job.runAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No queue jobs recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>Campaign scheduling remains API-driven and preflight-gated.</li>
          <li>Local worker execution remains explicit through documented npm commands.</li>
          <li>Dummy-provider delivery remains blocked from live SMS by demo-safe defaults.</li>
          <li>Billing and notifications are not created from this view.</li>
        </ul>
      </Panel>
    </main>
  );
}

function countCampaigns(campaigns: Awaited<ReturnType<typeof listCampaigns>>, status: CampaignStatus) {
  return campaigns.filter((campaign) => campaign.status === status).length;
}

function countJobs(jobs: Awaited<ReturnType<typeof prisma.queueJob.findMany>>, status: QueueJobStatus) {
  return jobs.filter((job) => job.status === status).length;
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
