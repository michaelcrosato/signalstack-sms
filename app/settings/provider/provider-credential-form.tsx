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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const response = await fetch("/api/settings/provider", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "twilio",
        twilio: {
          accountSid: String(formData.get("accountSid") ?? ""),
          authToken: String(formData.get("authToken") ?? ""),
          fromNumber: String(formData.get("fromNumber") ?? "")
        }
      })
    });

    if (!response.ok) {
      setState({ kind: "error", message: "Metadata was not saved." });
      return;
    }

    form.reset();
    setState({ kind: "success", message: "Metadata saved locally." });
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    const response = await fetch("/api/settings/provider", {
      method: "DELETE"
    });

    if (!response.ok) {
      setState({ kind: "error", message: "Metadata was not cleared." });
      return;
    }

    setState({ kind: "success", message: "Metadata cleared locally." });
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-950">Credential Metadata</h2>
        <p className="text-sm text-slate-600">Local readiness record only. Raw tokens are not shown after submission.</p>
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
            minLength={8}
            maxLength={80}
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
            minLength={8}
            maxLength={160}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          From number
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            name="fromNumber"
            placeholder="+15555550199"
            autoComplete="off"
            required
            minLength={5}
            maxLength={32}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={isPending}
          >
            Save Metadata
          </button>
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
            type="button"
            disabled={isPending}
            onClick={handleDelete}
          >
            Clear Metadata
          </button>
          {state.message ? (
            <p className={state.kind === "error" ? "text-sm font-medium text-red-700" : "text-sm font-medium text-teal-700"}>
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
