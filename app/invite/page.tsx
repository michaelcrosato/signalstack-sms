import { InviteAcceptance } from "./invite-acceptance";

export const dynamic = "force-dynamic";

export default function InvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-lg space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">SignalStack SMS</p>
          <h1 className="text-3xl font-semibold text-slate-950">Accept invitation</h1>
          <p className="text-sm leading-6 text-slate-600">
            Join with the matching signed-in account, verify an existing local account, or create one if this email is new.
          </p>
        </div>
        <InviteAcceptance />
      </section>
    </main>
  );
}
