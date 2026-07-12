"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

type FormState = {
  kind: "idle" | "success" | "error";
  message: string;
};

export function ProviderCredentialForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ kind: "idle", message: "" });
  const [clearConfirmed, setClearConfirmed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/settings/provider/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "twilio",
          externalAccountId: String(formData.get("accountSid") ?? ""),
          authToken: String(formData.get("authToken") ?? ""),
          isDefault: true,
        }),
      });

      if (!response.ok) {
        setState({ kind: "error", message: "Account verification failed." });
        return;
      }

      setState({ kind: "success", message: "Account verified and encrypted." });
      startTransition(() => router.refresh());
    } catch {
      setState({ kind: "error", message: "Account verification failed." });
    } finally {
      form.reset();
    }
  }

  async function handleDelete() {
    if (!clearConfirmed) {
      setState({
        kind: "error",
        message: "Confirm local metadata clearing first.",
      });
      return;
    }

    const response = await fetch("/api/settings/provider", {
      method: "DELETE",
    });

    if (!response.ok) {
      setState({ kind: "error", message: "Default account was not revoked." });
      return;
    }

    setState({ kind: "success", message: "Default account revoked locally." });
    setClearConfirmed(false);
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-950">
          Connect Twilio Account
        </h2>
        <p className="text-sm text-slate-600">
          Credentials are verified with Twilio, encrypted locally, and never
          returned after submission. This does not enable message sending.
        </p>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Account SID
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            name="accountSid"
            placeholder="AC1234567890"
            autoComplete="off"
            required
            minLength={34}
            maxLength={34}
            pattern="AC[A-Fa-f0-9]{32}"
            title="Use an Account SID containing AC followed by 32 hexadecimal characters."
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Auth token
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            name="authToken"
            type="password"
            autoComplete="off"
            required
            minLength={32}
            maxLength={32}
            pattern="[A-Fa-f0-9]{32}"
            title="The raw token is encrypted and is never shown after submission."
          />
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            className="mt-1"
            type="checkbox"
            checked={clearConfirmed}
            onChange={(event) => setClearConfirmed(event.currentTarget.checked)}
          />
          Revoke the selected default account locally. This does not change
          the provider-side Twilio account.
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={isPending}
          >
            Verify and Encrypt
          </button>
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
            type="button"
            disabled={isPending || !clearConfirmed}
            onClick={handleDelete}
          >
            Revoke Default Account
          </button>
          {state.message ? (
            <p
              className={
                state.kind === "error"
                  ? "text-sm font-medium text-red-700"
                  : "text-sm font-medium text-teal-700"
              }
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
