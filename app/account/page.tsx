import Link from "next/link";
import { AuthenticatedHeader } from "@/components/auth/authenticated-header";
import { requireProtectedPage } from "@/lib/auth/page-authentication";
import { AccountSessionControls } from "./session-controls";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const currentOrg = await requireProtectedPage("/account");

  return (
    <>
      <AuthenticatedHeader currentOrg={currentOrg} />
      <main className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Identity</p>
          <h1 className="text-3xl font-semibold text-slate-950">Account</h1>
        </header>
        <dl className="grid gap-4 rounded border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt><dd className="mt-1 text-slate-950">{currentOrg.email}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</dt><dd className="mt-1 text-slate-950">{currentOrg.orgName}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</dt><dd className="mt-1 text-slate-950">{currentOrg.role}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Authentication mode</dt><dd className="mt-1 text-slate-950">{currentOrg.demoMode ? "Demo" : "Built-in local"}</dd></div>
        </dl>
        <section className="space-y-4 rounded border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-950">Sessions</h2>
          <p className="text-sm leading-6 text-slate-600">
            Sign out this browser, or revoke every local session for your account if a device is lost.
          </p>
          <AccountSessionControls localAuth={!currentOrg.demoMode} />
        </section>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="font-semibold text-teal-700" href="/organizations">Manage organizations</Link>
          <Link className="font-semibold text-teal-700" href="/team">Manage team</Link>
        </div>
      </main>
    </>
  );
}
