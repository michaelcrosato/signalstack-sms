import { QueueJobStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";
import { getQueueOperationLinks } from "@/lib/operations/operator-surfaces";
import { getQueueOperationsStatus } from "@/lib/operations/queue-operations";
import { getSystemStatus } from "@/lib/operations/system-status";
import { scheduledCampaignJobSchema } from "@/lib/queue/jobs";
import { SettingsLink } from "@/app/settings/components/settings-link";

export const dynamic = "force-dynamic";

export default async function QueueOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const now = new Date();
  const [queueJobs, campaignCount] = await Promise.all([
    prisma.queueJob.findMany({
      where: { orgId: currentOrg.orgId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
            scheduledAt: true,
          },
        },
      },
      orderBy: [{ runAt: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.campaign.count({ where: { orgId: currentOrg.orgId } }),
  ]);
  const status = getSystemStatus(process.env);
  const queuedJobs = queueJobs.filter(
    (job) => job.status === QueueJobStatus.QUEUED,
  );
  const dueJobs = queuedJobs.filter(
    (job) => job.runAt.getTime() <= now.getTime(),
  );
  const futureJobs = queuedJobs.filter(
    (job) => job.runAt.getTime() > now.getTime(),
  );
  const invalidPayloadJobs = queueJobs.filter(
    (job) => !scheduledCampaignJobSchema.safeParse(job.payload).success,
  );
  const operationLinks = getQueueOperationLinks();
  const queueOperationsStatus = getQueueOperationsStatus();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          {operationLinks.map((link) => (
            <SettingsLink key={link.href} href={link.href}>
              {link.label}
            </SettingsLink>
          ))}
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">
            Settings
          </p>
          <h1 className="text-4xl font-semibold text-slate-950">
            Queue Operations
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only scheduled-campaign queue review for {currentOrg.orgName}.
            This page does not enqueue jobs, run workers, update campaign
            status, call Redis, call providers, create billing records, send
            notifications, send SMS, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Queue jobs" value={String(queueJobs.length)} />
        <Metric label="Due queued" value={String(dueJobs.length)} />
        <Metric label="Backend" value={status.queue.backend} />
        <Metric
          label="Jobs per poll"
          value={String(status.queue.workerMaxJobsPerPoll)}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Queue Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow
              label="Queued"
              value={String(countJobs(queueJobs, QueueJobStatus.QUEUED))}
            />
            <StatusRow
              label="Completed"
              value={String(countJobs(queueJobs, QueueJobStatus.COMPLETED))}
            />
            <StatusRow
              label="Cancelled"
              value={String(countJobs(queueJobs, QueueJobStatus.CANCELLED))}
            />
            <StatusRow
              label="Failed"
              value={String(countJobs(queueJobs, QueueJobStatus.FAILED))}
            />
            <StatusRow
              label="Invalid payloads"
              value={String(invalidPayloadJobs.length)}
            />
          </dl>
        </Panel>

        <Panel title="Worker Boundary">
          <dl className="grid gap-3 text-sm">
            <StatusRow
              label="Live messaging"
              value={String(status.safety.liveMessagingEnabled)}
            />
            <StatusRow
              label="Messaging provider"
              value={status.safety.messagingProvider}
            />
            <StatusRow
              label="Redis configured"
              value={String(status.queue.redisConfigured)}
            />
            <StatusRow label="Campaigns" value={String(campaignCount)} />
            <StatusRow
              label="Command execution"
              value={queueOperationsStatus.commandExecution}
            />
            <StatusRow
              label="External impact"
              value={queueOperationsStatus.externalImpact}
            />
            <StatusRow
              label="Mutation"
              value={queueOperationsStatus.mutation}
            />
            <StatusRow
              label="Secrets displayed"
              value={String(queueOperationsStatus.secretsDisplayed)}
            />
          </dl>
        </Panel>
      </section>

      <Panel title="Worker Command References">
        <ul className="grid gap-3 text-sm">
          {queueOperationsStatus.workerCommands.map((command) => (
            <li
              key={command.command}
              className="border-b border-slate-100 pb-3"
            >
              <p className="font-medium text-slate-950">{command.command}</p>
              <p className="mt-1 text-xs uppercase text-slate-500">
                {command.mode}
              </p>
              <p className="mt-1 text-slate-700">{command.boundary}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Scheduled Timing">
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <StatusRow label="Due queued jobs" value={String(dueJobs.length)} />
          <StatusRow
            label="Future queued jobs"
            value={String(futureJobs.length)}
          />
          <StatusRow label="Reference time" value={now.toISOString()} />
        </dl>
      </Panel>

      <Panel title="Recent Queue Jobs">
        <ul className="grid gap-3 text-sm">
          {queueJobs.length > 0 ? (
            queueJobs.map((job) => (
              <li
                key={job.id}
                className="grid gap-2 border-b border-slate-100 pb-3 lg:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-medium text-slate-950">
                    {job.type} / {job.status} /{" "}
                    {job.campaign?.name ?? "no campaign"}
                  </p>
                  <p className="mt-1 break-words text-xs text-slate-600">
                    {job.idempotencyKey}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Payload:{" "}
                    {scheduledCampaignJobSchema.safeParse(job.payload).success
                      ? "valid scheduled campaign job"
                      : "invalid scheduled campaign job"}
                  </p>
                </div>
                <div className="text-sm text-slate-600">
                  <time dateTime={job.runAt.toISOString()}>
                    {job.runAt.toISOString()}
                  </time>
                </div>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No queue jobs recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          {queueOperationsStatus.safetyBoundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </Panel>
    </main>
  );
}

function countJobs(
  jobs: Awaited<ReturnType<typeof prisma.queueJob.findMany>>,
  status: QueueJobStatus,
) {
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
