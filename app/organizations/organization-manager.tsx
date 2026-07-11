"use client";

import { useState, type FormEvent } from "react";
import type { OrganizationMembershipSummary } from "@/lib/auth/organization-service";

export function OrganizationManager({
  canCreateOrganization,
  currentOrganizationId,
  initialOrganizations
}: Readonly<{
  canCreateOrganization: boolean;
  currentOrganizationId: string;
  initialOrganizations: readonly OrganizationMembershipSummary[];
}>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function selectOrganization(organizationId: string) {
    setBusy(organizationId);
    setError(null);
    try {
      const response = await postJson("/api/auth/organizations/select", { organizationId });
      if (!response.ok) {
        setError(await responseError(response, "Organization could not be selected."));
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("Organization selection could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await postJson("/api/auth/organizations", {
        name: form.get("name"),
        slug: form.get("slug"),
        timezone: form.get("timezone")
      });
      if (!response.ok) {
        setError(await responseError(response, "Organization could not be created."));
        return;
      }
      window.location.reload();
    } catch {
      setError("Organization creation could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-3" aria-labelledby="organization-list-heading">
        <h2 className="text-xl font-semibold text-slate-950" id="organization-list-heading">
          Your workspaces
        </h2>
        {initialOrganizations.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No active organization memberships are available.
          </p>
        ) : (
          <ul className="space-y-3">
            {initialOrganizations.map(({ organization, role }) => {
              const selected = organization.id === currentOrganizationId;
              return (
                <li className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white p-5" key={organization.id}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{organization.name}</p>
                    <p className="truncate text-sm text-slate-500">
                      {organization.slug} · {organization.timezone} · {role}
                    </p>
                  </div>
                  <button
                    className="rounded border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 disabled:border-slate-300 disabled:text-slate-400"
                    disabled={selected || busy !== null}
                    onClick={() => selectOrganization(organization.id)}
                    type="button"
                  >
                    {selected ? "Current" : busy === organization.id ? "Switching…" : "Switch"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canCreateOrganization ? (
        <section className="space-y-4 rounded border border-slate-200 bg-white p-5" aria-labelledby="create-organization-heading">
          <h2 className="text-xl font-semibold text-slate-950" id="create-organization-heading">
            Create a workspace
          </h2>
          <form className="space-y-4" onSubmit={createOrganization}>
            <OrganizationField label="Name" name="name" maxLength={160} />
            <OrganizationField label="Slug" name="slug" maxLength={63} minLength={2} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
            <OrganizationField label="Timezone" name="timezone" defaultValue="America/Vancouver" maxLength={100} />
            <button className="w-full rounded bg-teal-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50" disabled={busy !== null} type="submit">
              {busy === "create" ? "Creating…" : "Create organization"}
            </button>
          </form>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        </section>
      ) : (
        <section className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Only a current organization owner can create another workspace.
        </section>
      )}
    </div>
  );
}

function OrganizationField({ label, name, ...props }: Readonly<{
  label: string;
  name: string;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}>) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input className="w-full rounded border border-slate-300 px-3 py-2" name={name} required {...props} />
    </label>
  );
}

function postJson(path: string, body: unknown) {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}
