"use client";

import { useState, type FormEvent } from "react";

export function SetupForm({ disabled = false }: Readonly<{ disabled?: boolean }>) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken: form.get("bootstrapToken"),
          email: form.get("email"),
          displayName: form.get("displayName"),
          password: form.get("password"),
          organizationName: form.get("organizationName"),
          organizationSlug: form.get("organizationSlug"),
          timezone: form.get("timezone")
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Setup could not be completed.");
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("Setup could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = disabled || submitting;
  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label="Bootstrap token" name="bootstrapToken" type="password" autoComplete="off" minLength={32} maxLength={192} disabled={blocked} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner name" name="displayName" autoComplete="name" maxLength={120} disabled={blocked} />
        <Field label="Owner email" name="email" type="email" autoComplete="email" maxLength={254} disabled={blocked} />
      </div>
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} disabled={blocked} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" name="organizationName" autoComplete="organization" maxLength={160} disabled={blocked} />
        <Field label="Organization slug" name="organizationSlug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minLength={2} maxLength={63} disabled={blocked} />
      </div>
      <Field label="Organization timezone" name="timezone" defaultValue="America/Vancouver" maxLength={100} disabled={blocked} />
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={blocked}
        type="submit"
      >
        {submitting ? "Creating owner…" : "Create owner and organization"}
      </button>
    </form>
  );
}

type FieldProps = Readonly<{
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  disabled?: boolean;
}>;

function Field({ label, name, type = "text", ...input }: FieldProps) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-950 shadow-sm focus:border-teal-700 focus:ring-teal-700"
        name={name}
        required
        type={type}
        {...input}
      />
    </label>
  );
}
