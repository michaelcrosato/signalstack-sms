import { MembershipRole } from "@prisma/client";
import { AuthenticatedHeader } from "@/components/auth/authenticated-header";
import { requireProtectedPage } from "@/lib/auth/page-authentication";
import { listOrganizationsForUser } from "@/lib/auth/organization-service";
import { OrganizationManager } from "./organization-manager";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const currentOrg = await requireProtectedPage("/organizations");
  const organizations = await listOrganizationsForUser({ userId: currentOrg.userId });

  return (
    <>
      <AuthenticatedHeader currentOrg={currentOrg} />
      <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Identity</p>
          <h1 className="text-3xl font-semibold text-slate-950">Organizations</h1>
          <p className="max-w-2xl text-slate-600">
            Switch the organization bound to this session or create another isolated workspace.
          </p>
        </header>
        <OrganizationManager
          canCreateOrganization={currentOrg.role === MembershipRole.OWNER}
          currentOrganizationId={currentOrg.orgId}
          initialOrganizations={organizations}
        />
      </main>
    </>
  );
}
