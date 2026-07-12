import Link from "next/link";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import { isSafeLocalRedirect } from "@/lib/validation/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ redirectTo?: string | string[] }> }>) {
  const config = getRuntimeConfig();
  const requestedRedirect = (await searchParams).redirectTo;
  const redirectTo =
    typeof requestedRedirect === "string" && isSafeLocalRedirect(requestedRedirect)
      ? requestedRedirect
      : "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">SignalStack SMS</p>
          <h1 className="text-3xl font-semibold text-slate-950">Sign in</h1>
          <p className="text-sm leading-6 text-slate-600">
            Use the account managed by this SignalStack installation.
          </p>
        </div>
        {config.auth.mode === "local" ? (
          <LoginForm redirectTo={redirectTo} />
        ) : (
          <div className="space-y-4">
            <p className="rounded border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
              Demo mode is active, so no local credential is required.
            </p>
            <Link className="block rounded bg-teal-700 px-4 py-3 text-center font-semibold text-white" href={redirectTo}>
              Continue to demo
            </Link>
          </div>
        )}
        <p className="text-sm text-slate-600">
          New installation?{" "}
          <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/setup">
            Run first-time setup
          </Link>
        </p>
      </section>
    </main>
  );
}
