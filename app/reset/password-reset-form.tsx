"use client";

import { useEffect, useState, type FormEvent } from "react";

const storedTokenKey = "signalstack.pending-reset-token";

export function PasswordResetForm() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fragmentToken) {
      window.sessionStorage.setItem(storedTokenKey, fragmentToken);
      window.history.replaceState(null, "", "/reset");
    }
    setToken(fragmentToken ?? window.sessionStorage.getItem(storedTokenKey));
    setReady(true);
  }, []);

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("This reset link is missing its one-time token.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    if (password !== form.get("passwordConfirmation")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password-resets/complete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(result?.error ?? "Password reset could not be completed.");
        return;
      }
      window.sessionStorage.removeItem(storedTokenKey);
      window.location.assign("/login");
    } catch {
      setError("Password reset could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="text-sm text-slate-600" role="status">Reading reset link…</p>;
  }

  if (!token) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
        Open the complete one-time reset link supplied by your administrator.
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={complete}>
      <label className="block space-y-1.5 text-sm font-medium text-slate-800">
        <span>New password</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="new-password" maxLength={128} minLength={12} name="password" required type="password" />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-800">
        <span>Confirm new password</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="new-password" maxLength={128} minLength={12} name="passwordConfirmation" required type="password" />
      </label>
      {error ? <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      <button className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">
        {busy ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
