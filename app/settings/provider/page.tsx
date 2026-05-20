import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";
import { getProviderCredential, listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";
import { getProviderSettings } from "@/lib/messaging/provider/settings";
import { ProviderCredentialForm } from "./provider-credential-form";

export const dynamic = "force-dynamic";

export default async function ProviderSettingsPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [complianceProfile, providerCredential, rotations] = await Promise.all([
    getOrCreateComplianceProfile(currentOrg.orgId),
    getProviderCredential(currentOrg.orgId, "twilio"),
    listProviderCredentialRotations(currentOrg.orgId, "twilio", 12)
  ]);
  const providerSettings = getProviderSettings({
    demoMode: currentOrg.demoMode,
    liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
    messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
    complianceProfile,
    providerCredential,
    env: process.env
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <Link className="text-sm font-medium text-teal-700" href="/settings">
          Go-Live Readiness
        </Link>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Provider Details</h1>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Twilio Metadata</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <StatusRow label="Account SID" value={String(providerSettings.twilio.accountSidConfigured)} />
            <StatusRow label="Auth token" value={String(providerSettings.twilio.authTokenConfigured)} />
            <StatusRow label="From number" value={String(providerSettings.twilio.fromNumberConfigured)} />
            <StatusRow label="Configured" value={String(providerSettings.twilio.configured)} />
            <StatusRow label="Source" value={providerSettings.twilio.source} />
            <StatusRow label="Account" value={providerSettings.twilio.accountSidRedacted ?? "not stored"} />
            <StatusRow label="From" value={providerSettings.twilio.fromNumberRedacted ?? "not stored"} />
          </dl>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Live Blockers</h2>
          <ul className="mt-4 grid gap-2 text-sm text-slate-700">
            {providerSettings.blockers.length > 0 ? (
              providerSettings.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)
            ) : (
              <li>No blockers recorded.</li>
            )}
          </ul>
        </section>
      </section>

      <ProviderCredentialForm />

      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Credential Rotation History</h2>
        <ul className="mt-4 grid gap-3 text-sm">
          {rotations.length > 0 ? (
            rotations.map((rotation) => (
              <li key={rotation.id} className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]">
                <span className="font-medium text-slate-950">
                  {rotation.action} / {rotation.provider} / {rotation.fromNumberRedacted ?? "not stored"}
                </span>
                <time className="text-slate-600" dateTime={rotation.createdAt.toISOString()}>
                  {rotation.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">No credential rotation history recorded.</li>
          )}
        </ul>
      </section>
    </main>
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
