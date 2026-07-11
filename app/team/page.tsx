import { MembershipRole } from "@prisma/client";
import { AuthenticatedHeader } from "@/components/auth/authenticated-header";
import { requireProtectedPage } from "@/lib/auth/page-authentication";
import { listTeam } from "@/lib/auth/team-service";
import { TeamManager } from "./team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const currentOrg = await requireProtectedPage("/team");
  const canManage =
    currentOrg.role === MembershipRole.OWNER || currentOrg.role === MembershipRole.ADMIN;
  if (!canManage) {
    return (
      <>
        <AuthenticatedHeader currentOrg={currentOrg} />
        <main className="mx-auto w-full max-w-3xl space-y-4 px-6 py-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Administration</p>
          <h1 className="text-3xl font-semibold text-slate-950">Team access is restricted</h1>
          <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            An ADMIN or OWNER role is required to view member and invitation details.
          </p>
        </main>
      </>
    );
  }

  const roster = await listTeam({ userId: currentOrg.userId, orgId: currentOrg.orgId });

  return (
    <>
      <AuthenticatedHeader currentOrg={currentOrg} />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Administration</p>
          <h1 className="text-3xl font-semibold text-slate-950">Team</h1>
          <p className="max-w-2xl text-slate-600">
            Manage local accounts and copy one-time invitation links without requiring an email service.
          </p>
        </header>
        <TeamManager
          actorRole={currentOrg.role}
          canManage={canManage}
          currentUserId={currentOrg.userId}
          initialRoster={{
            members: roster.members.map((member) => ({
              ...member,
              createdAt: member.createdAt.toISOString(),
              updatedAt: member.updatedAt.toISOString()
            })),
            pendingInvites: roster.pendingInvites.map((invite) => ({
              ...invite,
              expiresAt: invite.expiresAt.toISOString(),
              createdAt: invite.createdAt.toISOString()
            }))
          }}
        />
      </main>
    </>
  );
}
