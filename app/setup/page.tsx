import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const config = getRuntimeConfig();

  if (config.auth.mode !== "local") {
    return (
      <AuthShell eyebrow="First-run setup" title="Local setup is not active">
        <p className="text-sm leading-6 text-slate-600">
          This runtime is in demo mode. Switch to the self-hosted local-auth profile before creating
          the first owner, or continue into the demo workspace.
        </p>
        <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/dashboard">
          Open demo workspace
        </Link>
      </AuthShell>
    );
  }

  const setupOpen = (await prisma.localCredential.count()) === 0;
  if (!setupOpen) {
    return (
      <AuthShell eyebrow="First-run setup" title="Setup is already complete">
        <p className="text-sm leading-6 text-slate-600">
          An owner credential already exists. Sign in to manage this installation.
        </p>
        <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/login">
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="First-run setup" title="Create the first owner">
      <p className="text-sm leading-6 text-slate-600">
        Use the bootstrap token provisioned by your operator. It is checked server-side and is never
        stored with your account.
      </p>
      {!config.auth.bootstrapTokenConfigured ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          Setup is locked until a valid server-side bootstrap token is configured.
        </p>
      ) : null}
      <SetupForm disabled={!config.auth.bootstrapTokenConfigured} />
      <p className="text-sm text-slate-600">
        Already configured?{" "}
        <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({
  eyebrow,
  title,
  children
}: Readonly<{ eyebrow: string; title: string; children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-xl space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>
          <h1 className="text-3xl font-semibold text-slate-950">{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}
