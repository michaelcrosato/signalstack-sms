import { MembershipRole, MembershipStatus } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function TeamOperationsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: currentOrg.orgId },
    select: {
      name: true,
      slug: true,
      demoMode: true,
      timezone: true,
      createdAt: true,
      memberships: {
        include: {
          user: {
            select: {
              email: true,
              displayName: true,
              clerkUserId: true,
              createdAt: true,
              _count: {
                select: {
                  assignedConversations: true,
                  internalNotes: true
                }
              }
            }
          }
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  const memberships = organization.memberships;
  const activeMemberships = countStatus(memberships, MembershipStatus.ACTIVE);
  const assignedConversationCount = memberships.reduce(
    (total, membership) => total + membership.user._count.assignedConversations,
    0
  );
  const authoredNoteCount = memberships.reduce((total, membership) => total + membership.user._count.internalNotes, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/demo">
          Demo Console
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/campaigns">
          Campaign Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/contacts">
          Contact Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/inbox">
          Inbox Operations
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/system">
          System Status
        </Link>
        <Link className="text-sm font-medium text-teal-700" href="/settings/runbook">
          Operator Runbook
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Team Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Read-only organization and membership review for {organization.name}. This page does not invite users,
            change roles, suspend members, delete memberships, call Clerk, send email, send notifications, expose
            secrets, call providers, create billing records, send SMS, or enable live messaging.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Members" value={String(memberships.length)} />
        <Metric label="Active" value={String(activeMemberships)} />
        <Metric label="Assigned threads" value={String(assignedConversationCount)} />
        <Metric label="Internal notes" value={String(authoredNoteCount)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Organization">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Name" value={organization.name} />
            <StatusRow label="Slug" value={organization.slug} />
            <StatusRow label="Timezone" value={organization.timezone} />
            <StatusRow label="Demo mode" value={String(organization.demoMode)} />
            <StatusRow label="Created" value={organization.createdAt.toISOString()} />
          </dl>
        </Panel>

        <Panel title="Membership Status">
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Owners" value={String(countRole(memberships, MembershipRole.OWNER))} />
            <StatusRow label="Admins" value={String(countRole(memberships, MembershipRole.ADMIN))} />
            <StatusRow label="Members" value={String(countRole(memberships, MembershipRole.MEMBER))} />
            <StatusRow label="Active" value={String(activeMemberships)} />
            <StatusRow label="Invited" value={String(countStatus(memberships, MembershipStatus.INVITED))} />
            <StatusRow label="Suspended" value={String(countStatus(memberships, MembershipStatus.SUSPENDED))} />
          </dl>
        </Panel>
      </section>

      <Panel title="Team Members">
        <ul className="grid gap-3 text-sm">
          {memberships.length > 0 ? (
            memberships.map((membership) => (
              <li key={membership.id} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-950">{membership.user.displayName ?? membership.user.email}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {membership.user.email} / {membership.user._count.assignedConversations} assigned threads /{" "}
                    {membership.user._count.internalNotes} notes
                  </p>
                </div>
                <span className="text-slate-600">
                  {membership.role} / {membership.status}
                </span>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No memberships recorded.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Safety Boundary">
        <ul className="grid gap-2 text-sm text-slate-700">
          <li>Team records are read from the local app membership model only.</li>
          <li>Invite, role, suspension, and deletion actions are not available from this view.</li>
          <li>Clerk integration remains a future auth adapter boundary and is not called here.</li>
          <li>No email, notifications, provider calls, billing records, live SMS, or mutations are created.</li>
        </ul>
      </Panel>
    </main>
  );
}

type MembershipRoleStatus = {
  role: MembershipRole;
  status: MembershipStatus;
};

function countRole(memberships: MembershipRoleStatus[], role: MembershipRole) {
  return memberships.filter((membership) => membership.role === role).length;
}

function countStatus(memberships: MembershipRoleStatus[], status: MembershipStatus) {
  return memberships.filter((membership) => membership.status === status).length;
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
