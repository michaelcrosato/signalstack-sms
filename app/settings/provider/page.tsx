import { MembershipRole } from "@prisma/client";
import { SettingsLink } from "@/components/settings/SettingsLink";
import Link from "next/link";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { hasRoleAtLeast } from "@/lib/auth/roles";
import { getComplianceProfile } from "@/lib/db/repositories/compliance";
import {
  getProviderCredential,
  listProviderCredentialRotations,
} from "@/lib/db/repositories/provider-credentials";
import {
  listOwnedProviderPhoneNumbers,
  listProviderAccounts,
  listProviderMessagingServices,
} from "@/lib/integrations/provider-accounts/service";
import { getProviderSettings } from "@/lib/messaging/provider/settings";
import { getProviderOperationLinks } from "@/lib/operations/operator-surfaces";
import {
  providerCredentialRotationActionSchema,
  type ProviderCredentialRotationAction,
} from "@/lib/validation/provider";
import { ProviderCredentialForm } from "./provider-credential-form";
import { ProviderAccountControls } from "./provider-account-controls";

export const dynamic = "force-dynamic";

const rotationActions: ProviderCredentialRotationAction[] = [
  "CONFIGURED",
  "REFRESHED",
  "ROTATED",
  "DELETED",
];

type ProviderSettingsPageProps = {
  searchParams?: Promise<{
    action?: string;
  }>;
};

export default async function ProviderSettingsPage({
  searchParams,
}: ProviderSettingsPageProps) {
  const params = await searchParams;
  const actionFilter = providerCredentialRotationActionSchema.safeParse(
    params?.action,
  );
  const selectedAction = actionFilter.success ? actionFilter.data : undefined;
  const currentOrg = await getOrCreateCurrentOrg();
  if (!hasRoleAtLeast(currentOrg.role, MembershipRole.ADMIN)) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
        <h1 className="text-3xl font-semibold text-slate-950">Provider Details</h1>
        <p className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Provider account controls require an ADMIN or OWNER role.
        </p>
      </main>
    );
  }
  const [
    complianceProfile,
    providerCredential,
    rotations,
    providerAccounts,
    providerPhoneNumbers,
    providerMessagingServices,
  ] = await Promise.all([
    getComplianceProfile(currentOrg.orgId),
    getProviderCredential(currentOrg.orgId, "twilio"),
    listProviderCredentialRotations(
      currentOrg.orgId,
      "twilio",
      12,
      selectedAction,
    ),
    listProviderAccounts(currentOrg.orgId),
    listOwnedProviderPhoneNumbers(currentOrg.orgId),
    listProviderMessagingServices(currentOrg.orgId),
  ]);
  const providerSettings = getProviderSettings({
    demoMode: currentOrg.demoMode,
    liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
    messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
    complianceProfile,
    providerAccounts,
    providerPhoneNumbers,
    providerCredential,
    env: process.env,
  });
  const operationLinks = getProviderOperationLinks();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
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
            Provider Details
          </h1>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Verified Twilio Control Plane
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <StatusRow
              label="Account SID"
              value={String(providerSettings.twilio.accountSidConfigured)}
            />
            <StatusRow
              label="Auth token"
              value={String(providerSettings.twilio.authTokenConfigured)}
            />
            <StatusRow
              label="From number"
              value={String(providerSettings.twilio.fromNumberConfigured)}
            />
            <StatusRow
              label="Configured"
              value={String(providerSettings.twilio.configured)}
            />
            <StatusRow
              label="Verified accounts"
              value={String(providerSettings.twilio.verifiedAccountCount)}
            />
            <StatusRow
              label="Verified numbers"
              value={String(providerSettings.twilio.verifiedNumberCount)}
            />
            <StatusRow label="Source" value={providerSettings.twilio.source} />
            <StatusRow
              label="Account"
              value={providerSettings.twilio.accountSidRedacted ?? "not stored"}
            />
            <StatusRow
              label="From"
              value={providerSettings.twilio.fromNumberRedacted ?? "not stored"}
            />
          </dl>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Live Blockers
          </h2>
          <ul className="mt-4 grid gap-2 text-sm text-slate-700">
            {providerSettings.blockers.length > 0 ? (
              providerSettings.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))
            ) : (
              <li>No blockers recorded.</li>
            )}
          </ul>
        </section>
      </section>

      <ProviderCredentialForm />
      <ProviderAccountControls
        accounts={providerAccounts.map((account) => ({
          id: account.id,
          externalAccountIdLast4: account.externalAccountIdLast4,
          status: account.status,
          isDefault: account.isDefault,
          activeCredentialVersion: account.activeCredentialVersion,
        }))}
        phoneNumbers={providerPhoneNumbers.map((number) => ({
          id: number.id,
          providerAccountId: number.providerAccountId,
          phoneNumber: number.phoneNumber,
          status: number.status,
          isDefault: number.isDefault,
        }))}
        messagingServices={providerMessagingServices.map((service) => ({
          id: service.id,
          providerAccountId: service.providerAccountId,
          externalServiceIdLast4: service.externalServiceIdLast4,
          status: service.status,
          isDefault: service.isDefault,
        }))}
      />

      <section className="grid gap-6 lg:grid-cols-3">
        <ProviderResourcePanel
          title="Provider accounts"
          empty="No verified provider accounts."
          rows={providerAccounts.map((account) =>
            `${account.externalAccountIdLast4} / ${account.status} / credential v${account.activeCredentialVersion ?? "none"}`
          )}
        />
        <ProviderResourcePanel
          title="Owned numbers"
          empty="No verified provider numbers."
          rows={providerPhoneNumbers.map((number) =>
            `${number.phoneNumber} / ${number.status} / ${number.capabilities.join(", ")}`
          )}
        />
        <ProviderResourcePanel
          title="Messaging services"
          empty="No verified messaging services."
          rows={providerMessagingServices.map((service) =>
            `${service.externalServiceIdLast4} / ${service.status}`
          )}
        />
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-slate-950">
            Legacy Metadata History (Unverified)
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded border border-teal-700 px-3 py-1 text-xs font-semibold text-teal-700"
              href={`/api/settings/provider/rotations/export?limit=50${selectedAction ? `&action=${selectedAction}` : ""}`}
            >
              Export Legacy CSV
            </Link>
            <nav
              aria-label="Credential rotation filters"
              className="flex flex-wrap gap-2"
            >
              <FilterLink
                href="/settings/provider"
                label="All"
                active={!selectedAction}
              />
              {rotationActions.map((action) => (
                <FilterLink
                  key={action}
                  href={`/settings/provider?action=${action}`}
                  label={action}
                  active={selectedAction === action}
                />
              ))}
            </nav>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          These retained pre-M4 metadata records are display-only and never authorize provider access.
        </p>
        <ul className="mt-4 grid gap-3 text-sm">
          {rotations.length > 0 ? (
            rotations.map((rotation) => (
              <li
                key={rotation.id}
                className="grid gap-1 border-b border-slate-100 pb-3 md:grid-cols-[1fr_auto]"
              >
                <span className="font-medium text-slate-950">
                  {rotation.action} / {rotation.provider} /{" "}
                  {rotation.fromNumberRedacted ?? "not stored"}
                </span>
                <time
                  className="text-slate-600"
                  dateTime={rotation.createdAt.toISOString()}
                >
                  {rotation.createdAt.toISOString()}
                </time>
              </li>
            ))
          ) : (
            <li className="text-slate-600">
              No legacy metadata history recorded.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      className={
        active
          ? "rounded border border-slate-950 bg-slate-950 px-3 py-1 text-xs font-semibold text-white"
          : "rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
      }
      href={href}
    >
      {label}
    </Link>
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

function ProviderResourcePanel({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: string[];
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <ul className="mt-4 grid gap-2 text-sm text-slate-700">
        {rows.length > 0 ? rows.map((row) => <li key={row}>{row}</li>) : <li>{empty}</li>}
      </ul>
    </section>
  );
}
