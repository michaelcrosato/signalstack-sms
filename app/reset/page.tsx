import Link from "next/link";
import { PasswordResetForm } from "./password-reset-form";

export const dynamic = "force-dynamic";

export default function PasswordResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">SignalStack SMS</p>
          <h1 className="text-3xl font-semibold text-slate-950">Reset password</h1>
          <p className="text-sm leading-6 text-slate-600">
            Set a new local password using the one-time reset link supplied by an administrator.
          </p>
        </div>
        <PasswordResetForm />
        <Link className="text-sm font-semibold text-teal-700 hover:text-teal-900" href="/login">
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
