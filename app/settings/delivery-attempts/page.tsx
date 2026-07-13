import { MembershipRole } from "@prisma/client";
import { SettingsLink } from "@/components/settings/SettingsLink";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { hasRoleAtLeast } from "@/lib/auth/roles";
import { listDeliveryAttempts } from "@/lib/messaging/delivery-attempt-review";
import { DeliveryAttemptReviewControls } from "./review-controls";

export const dynamic = "force-dynamic";

export default async function DeliveryAttemptReviewPage() {
  const currentOrg = await getOrCreateCurrentOrg();
  if (!hasRoleAtLeast(currentOrg.role, MembershipRole.ADMIN)) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
        <h1 className="text-3xl font-semibold text-slate-950">Delivery Attempt Review</h1>
        <p className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Delivery-attempt review requires an ADMIN or OWNER role.
        </p>
      </main>
    );
  }
  const { attempts, nextCursor } = await listDeliveryAttempts(currentOrg.orgId, { limit: 50 });
  const reviewCount = attempts.filter((attempt) => attempt.requiresReview).length;
  const retryCount = attempts.filter((attempt) => attempt.canRetry).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <nav aria-label="Related settings" className="flex flex-wrap gap-2">
          <SettingsLink href="/settings">Go-Live Readiness</SettingsLink>
          <SettingsLink href="/settings/provider">Provider Details</SettingsLink>
          <SettingsLink href="/settings/queue">Campaign Queue</SettingsLink>
        </nav>
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">Settings</p>
          <h1 className="text-4xl font-semibold text-slate-950">Delivery Attempt Review</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Tenant-scoped direct-message attempt evidence for {currentOrg.orgName}. Destination and
            sender values are reduced to last-four hints; message content, credentials, callback
            correlation, provider account identity, and internal attestation notes are never shown.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Recent attempts" value={String(attempts.length)} />
        <Metric label="Needs review" value={String(reviewCount)} />
        <Metric label="Eligible for retry" value={String(retryCount)} />
        <Metric label="More history" value={nextCursor ? "available via API" : "none"} />
      </section>

      <section className="rounded border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <h2 className="font-semibold">Explicit operator actions only</h2>
        <p className="mt-1">
          Reconcile performs one provider read when a known provider message ID exists. Attestation
          records an internal reason only after the exact confirmation phrase. Retry is separate and
          creates a queued successor; it never calls the provider and still must pass the complete
          worker gate.
        </p>
      </section>

      <section className="grid gap-4">
        {attempts.length > 0 ? (
          attempts.map((attempt) => (
            <article key={attempt.id} className="rounded border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950">
                    Attempt {attempt.attemptNumber} · {attempt.attemptStatus}
                  </h2>
                  <p className="mt-1 break-all text-xs text-slate-600">
                    Attempt {attempt.id} · Message {attempt.messageId}
                  </p>
                </div>
                <span
                  className={
                    attempt.requiresReview
                      ? "rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900"
                      : "rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                  }
                >
                  {attempt.requiresReview ? "Review required" : attempt.applicationStatus}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Status label="Transport" value={attempt.transport} />
                <Status label="Destination" value={`ending ${attempt.destinationLastFour}`} />
                <Status
                  label="Sender"
                  value={attempt.senderLastFour ? `ending ${attempt.senderLastFour}` : "not applicable"}
                />
                <Status label="Provider proof" value={attempt.hasProviderMessageId ? "known" : "absent"} />
                <Status label="Provider status" value={attempt.providerStatus ?? "none"} />
                <Status label="Provider error" value={attempt.providerErrorCode ?? "none"} />
                <Status label="Created" value={attempt.timestamps.createdAt} />
                <Status label="Completed" value={attempt.timestamps.completedAt ?? "not completed"} />
              </dl>
              <DeliveryAttemptReviewControls attempt={attempt} />
            </article>
          ))
        ) : (
          <p className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No direct-message attempts are recorded for this organization.
          </p>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
function Status({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-all text-slate-800">{value}</dd>
    </div>
  );
}
