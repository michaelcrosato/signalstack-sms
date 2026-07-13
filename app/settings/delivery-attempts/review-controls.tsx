"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import type { DeliveryAttemptReviewDto } from "@/lib/messaging/delivery-attempt-review";

type Notice = Readonly<{ kind: "idle" | "success" | "error"; message: string }>;

export function DeliveryAttemptReviewControls({
  attempt
}: Readonly<{ attempt: DeliveryAttemptReviewDto }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>({ kind: "idle", message: "" });
  const base = `/api/settings/delivery-attempts/${encodeURIComponent(attempt.id)}`;

  async function run(path: string, init: RequestInit, success: string) {
    setNotice({ kind: "idle", message: "" });
    try {
      const response = await fetch(`${base}/${path}`, init);
      if (!response.ok) {
        setNotice({ kind: "error", message: await safeError(response) });
        return;
      }
      setNotice({ kind: "success", message: success });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ kind: "error", message: "Delivery-attempt review operation failed." });
    }
  }

  async function attest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await run(
      "attest-not-sent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: String(values.get("confirmation") ?? ""),
          reason: String(values.get("reason") ?? "")
        })
      },
      "No-send attestation recorded. Use the separate retry control if a successor is required."
    );
    form.reset();
  }

  async function retry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await run(
      "retry",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: String(values.get("confirmation") ?? "") })
      },
      "One queued successor attempt was created."
    );
    form.reset();
  }

  if (!attempt.canReconcile && !attempt.canAttestNotSent && !attempt.canRetry) return null;

  return (
    <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-3">
      {attempt.canReconcile ? (
        <div className="grid content-start gap-2">
          <h3 className="text-sm font-semibold text-slate-950">Provider reconciliation</h3>
          <p className="text-xs leading-5 text-slate-600">
            Fetch and verify the known provider message. This never creates a message.
          </p>
          <button
            className="w-fit rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                "reconcile",
                { method: "POST" },
                "Provider evidence reconciled."
              )
            }
          >
            Reconcile provider evidence
          </button>
        </div>
      ) : null}

      {attempt.canAttestNotSent ? (
        <form className="grid content-start gap-2" onSubmit={attest}>
          <h3 className="text-sm font-semibold text-slate-950">Attest no send</h3>
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Type ATTEST NOT SENT
            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              name="confirmation"
              autoComplete="off"
              required
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Internal reason (10–500 characters)
            <textarea
              className="min-h-24 rounded border border-slate-300 px-3 py-2 text-sm"
              name="reason"
              minLength={10}
              maxLength={500}
              required
            />
          </label>
          <button
            className="w-fit rounded border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
            type="submit"
            disabled={isPending}
          >
            Record NOT_SENT attestation
          </button>
        </form>
      ) : null}

      {attempt.canRetry ? (
        <form className="grid content-start gap-2" onSubmit={retry}>
          <h3 className="text-sm font-semibold text-slate-950">Create successor</h3>
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Type RETRY MESSAGE
            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              name="confirmation"
              autoComplete="off"
              required
            />
          </label>
          <button
            className="w-fit rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
            type="submit"
            disabled={isPending}
          >
            Create one queued retry
          </button>
        </form>
      ) : null}

      {notice.message ? (
        <p
          className={
            notice.kind === "error"
              ? "text-sm font-medium text-red-700 lg:col-span-3"
              : "text-sm font-medium text-teal-700 lg:col-span-3"
          }
          role="status"
        >
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}

async function safeError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string"
      ? payload.error
      : "Delivery-attempt review operation failed.";
  } catch {
    return "Delivery-attempt review operation failed.";
  }
}
