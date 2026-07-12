"use client";

import { useState } from "react";

export function LogoutPanel() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) {
        setError("Sign out could not be completed.");
        return;
      }
      window.location.assign("/login");
    } catch {
      setError("Sign out could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">End this browser session on the current installation.</p>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      <button className="w-full rounded bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={submitting} onClick={logout} type="button">
        {submitting ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
