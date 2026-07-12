"use client";

import { useState, type FormEvent } from "react";

export function LoginForm({ redirectTo }: Readonly<{ redirectTo: string }>) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          redirectTo
        })
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;
      if (!response.ok) {
        setError(body?.error ?? "Sign in failed.");
        return;
      }

      window.location.assign(body?.redirectTo ?? redirectTo);
    } catch {
      setError("Sign in could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-1.5 text-sm font-medium text-slate-800">
        <span>Email</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="email" maxLength={254} name="email" required type="email" />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-800">
        <span>Password</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="current-password" maxLength={128} minLength={12} name="password" required type="password" />
      </label>
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <button className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={submitting} type="submit">
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
