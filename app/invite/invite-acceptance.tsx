"use client";

import { useEffect, useState, type FormEvent } from "react";

const storedTokenKey = "signalstack.pending-invite-token";

export function InviteAcceptance() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fragmentToken) {
      window.sessionStorage.setItem(storedTokenKey, fragmentToken);
      window.history.replaceState(null, "", "/invite");
    }
    setToken(fragmentToken ?? window.sessionStorage.getItem(storedTokenKey));
    setReady(true);
  }, []);

  async function acceptWithCurrentAccount() {
    await accept({ token });
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await accept({
      token,
      displayName: form.get("displayName"),
      password: form.get("password")
    });
  }

  async function acceptWithExistingAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await accept({
      token,
      email: form.get("email"),
      password: form.get("password")
    });
  }

  async function accept(body: unknown) {
    if (!token) {
      setError("This invitation link is missing its one-time token.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/team/invites/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(result?.error ?? "Invitation could not be accepted.");
        return;
      }
      window.sessionStorage.removeItem(storedTokenKey);
      window.location.assign("/team");
    } catch {
      setError("Invitation acceptance could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="text-sm text-slate-600" role="status">Reading invitation…</p>;
  }

  return (
    <div className="space-y-6">
      {!token ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          Open the complete one-time invitation link supplied by your administrator.
        </p>
      ) : (
        <>
          <button className="w-full rounded border border-teal-700 px-4 py-3 font-semibold text-teal-800 disabled:opacity-50" disabled={busy} onClick={acceptWithCurrentAccount} type="button">
            Accept with signed-in account
          </button>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400"><span className="h-px flex-1 bg-slate-200" />or prove an existing local account<span className="h-px flex-1 bg-slate-200" /></div>
          <form className="space-y-4" onSubmit={acceptWithExistingAccount}>
            <label className="block space-y-1.5 text-sm font-medium text-slate-800">
              <span>Email</span>
              <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="email" maxLength={254} name="email" required type="email" />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-slate-800">
              <span>Password</span>
              <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="current-password" maxLength={128} minLength={12} name="password" required type="password" />
            </label>
            <button className="w-full rounded border border-teal-700 px-4 py-3 font-semibold text-teal-800 disabled:opacity-50" disabled={busy} type="submit">
              {busy ? "Accepting…" : "Verify account and accept"}
            </button>
          </form>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400"><span className="h-px flex-1 bg-slate-200" />or create a local account<span className="h-px flex-1 bg-slate-200" /></div>
          <form className="space-y-4" onSubmit={createAccount}>
            <label className="block space-y-1.5 text-sm font-medium text-slate-800">
              <span>Display name</span>
              <input className="w-full rounded border border-slate-300 px-3 py-2" maxLength={120} name="displayName" required />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-slate-800">
              <span>Password</span>
              <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="new-password" maxLength={128} minLength={12} name="password" required type="password" />
            </label>
            <button className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">
              {busy ? "Accepting…" : "Create account and accept"}
            </button>
          </form>
        </>
      )}
      {error ? <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
    </div>
  );
}
