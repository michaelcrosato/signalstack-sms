"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { liveTestSmsConfirmation } from "@/lib/messaging/live-test-sms-constants";

type LiveTestSmsFormProps = {
  enabled: boolean;
  blockers: string[];
  allowedRecipients: string[];
  fromNumber: string | null;
};

type SendState =
  | { status: "idle"; message: string }
  | { status: "sending"; message: string }
  | { status: "sent"; message: string }
  | { status: "blocked"; message: string }
  | { status: "failed"; message: string };

export function LiveTestSmsForm({ enabled, blockers, allowedRecipients, fromNumber }: LiveTestSmsFormProps) {
  const [to, setTo] = useState(allowedRecipients[0] ?? "");
  const [body, setBody] = useState("SignalStack live investor demo test.");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<SendState>({ status: "idle", message: "No live test SMS sent from this page yet." });

  async function submitLiveTestSms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "sending", message: "Sending live test SMS through Twilio." });

    const response = await fetch("/api/demo/live-test-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, body, confirmation })
    });
    const payload = await response.json();

    if (response.ok && payload.sent) {
      setState({
        status: "sent",
        message: `Sent through Twilio. Provider status: ${payload.providerStatus}; recipient ending ${payload.toLast4}.`
      });
      return;
    }

    if (response.status === 403) {
      setState({
        status: "blocked",
        message: `Blocked: ${(payload.blockers ?? []).join(", ")}`
      });
      return;
    }

    setState({
      status: "failed",
      message: payload.error ?? "Live test SMS failed."
    });
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase text-slate-500">Live Test SMS</p>
        <h2 className="text-xl font-semibold text-slate-950">Send One Investor Demo Text</h2>
        <p className="text-sm leading-6 text-slate-700">
          This is the only live-send surface. It requires explicit Twilio environment credentials, a recipient allowlist,
          live messaging, and the confirmation phrase before it calls Twilio.
        </p>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <Status label="Status" value={enabled ? "enabled" : "blocked"} />
        <Status label="From" value={fromNumber ?? "not configured"} />
        <Status label="Allowlist" value={allowedRecipients.length > 0 ? allowedRecipients.join(", ") : "empty"} />
      </dl>

      {blockers.length > 0 ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Blockers: {blockers.join(", ")}
        </div>
      ) : null}

      <form className="mt-5 grid gap-4" onSubmit={submitLiveTestSms}>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Recipient phone
          <input
            className="rounded border border-slate-300 px-3 py-2 font-normal text-slate-950"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="+15879873814"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Message
          <textarea
            className="min-h-24 rounded border border-slate-300 px-3 py-2 font-normal text-slate-950"
            value={body}
            maxLength={320}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Confirmation phrase
          <input
            className="rounded border border-slate-300 px-3 py-2 font-normal text-slate-950"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={liveTestSmsConfirmation}
          />
        </label>
        <button
          className="w-fit rounded border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
          type="submit"
          disabled={!enabled || state.status === "sending"}
        >
          Send Live Test SMS
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-700" role="status">
        {state.message}
      </p>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-950">{value}</dd>
    </div>
  );
}
