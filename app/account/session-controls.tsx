"use client";

import Link from "next/link";
import { useState } from "react";

export function AccountSessionControls({ localAuth }: Readonly<{ localAuth: boolean }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revokeAll() {
    if (!window.confirm("Revoke every local session for this account?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sessions/revoke-all", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(result?.error ?? "Sessions could not be revoked.");
        return;
      }
      window.location.assign("/login");
    } catch {
      setError("Session revocation could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Link className="rounded border border-slate-300 px-4 py-2 font-semibold text-slate-800" href="/logout">
          Sign out this browser
        </Link>
        {localAuth ? (
          <button className="rounded border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50" disabled={busy} onClick={revokeAll} type="button">
            {busy ? "Revoking…" : "Revoke all sessions"}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
