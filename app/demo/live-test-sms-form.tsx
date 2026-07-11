"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";

type LiveTestSmsFormProps = {
  enabled: boolean;
  blockers: string[];
  allowedRecipientCount: number;
  allowedRecipientLast4: string[];
  fromNumberConfigured: boolean;
  fromNumberLast4: string | null;
};

type SendState =
  | { status: "idle"; message: string }
  | { status: "sending"; message: string }
  | { status: "sent"; message: string }
  | { status: "blocked"; message: string }
  | { status: "pending"; message: string }
  | { status: "failed"; message: string };

export function LiveTestSmsForm({
  enabled,
  blockers,
  allowedRecipientCount,
  allowedRecipientLast4,
  fromNumberConfigured,
  fromNumberLast4
}: LiveTestSmsFormProps) {
  const [to, setTo] = useState("");
  const [body, setBody] = useState("SignalStack live investor demo test.");
  const [confirmation, setConfirmation] = useState("");
  const [operatorToken, setOperatorToken] = useState("");
  const [state, setState] = useState<SendState>({ status: "idle", message: "No live test SMS sent from this page yet." });
  const requestIdRef = useRef<string | null>(null);

  async function submitLiveTestSms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "sending", message: "Sending live test SMS through Twilio." });

    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;

    let response: Response;
    let payload: Record<string, unknown>;
    try {
      response = await fetch("/api/demo/live-test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, to, body, confirmation, operatorToken })
      });
      payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setOperatorToken("");
      setConfirmation("");
      setState({
        status: "pending",
        message:
          "The result could not be confirmed. Re-enter both operator controls and retry to check the same idempotent request without sending twice."
      });
      return;
    }

    setOperatorToken("");
    setConfirmation("");

    if (response.ok && payload.sent) {
      requestIdRef.current = null;
      setState({
        status: "sent",
        message: `Sent through Twilio. Provider status: ${payload.providerStatus}; recipient ending ${payload.toLast4}.`
      });
      return;
    }

    if (response.status === 202 && payload.pending) {
      setState({
        status: "pending",
        message:
          "This request is reserved and its provider outcome is uncertain. Re-enter both operator controls and retry to inspect the same request; do not start a new request."
      });
      return;
    }

    if (response.status === 403) {
      setState({
        status: "blocked",
        message: `Blocked: ${Array.isArray(payload.blockers) ? payload.blockers.join(", ") : "live-send gate rejected the request"}`
      });
      return;
    }

    if (response.status >= 500 && payload.failed !== true) {
      setState({
        status: "pending",
        message:
          "The result could not be confirmed. Re-enter both operator controls and retry to inspect the same idempotent request."
      });
      return;
    }

    setState({
      status: "failed",
      message: typeof payload.error === "string" ? payload.error : "Live test SMS failed."
    });
  }

  function beginNewRequest(update: () => void) {
    requestIdRef.current = null;
    update();
  }

  function explicitlyStartNewRequest() {
    requestIdRef.current = null;
    setState({ status: "idle", message: "A new live-test request will be created on the next submit." });
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase text-slate-500">Live Test SMS</p>
        <h2 className="text-xl font-semibold text-slate-950">Send One Investor Demo Text</h2>
        <p className="text-sm leading-6 text-slate-700">
          This is the only live-send surface. It requires explicit Twilio environment credentials, a recipient allowlist,
          live messaging, a server-configured operator token, and the confirmation phrase before it calls Twilio. Neither
          operator control is rendered or retained after a request.
        </p>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <Status label="Status" value={enabled ? "enabled" : "blocked"} />
        <Status
          label="From"
          value={fromNumberConfigured && fromNumberLast4 ? `configured (ending ${fromNumberLast4})` : "not configured"}
        />
        <Status
          label="Allowlist"
          value={
            allowedRecipientCount > 0
              ? `${allowedRecipientCount} configured (endings ${allowedRecipientLast4.join(", ")})`
              : "empty"
          }
        />
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
            onChange={(event) => beginNewRequest(() => setTo(event.target.value))}
            placeholder="Enter the full allowlisted number"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Message
          <textarea
            className="min-h-24 rounded border border-slate-300 px-3 py-2 font-normal text-slate-950"
            value={body}
            maxLength={320}
            onChange={(event) => beginNewRequest(() => setBody(event.target.value))}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Confirmation phrase
          <input
            className="rounded border border-slate-300 px-3 py-2 font-normal text-slate-950"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Enter the operator confirmation phrase"
            autoComplete="off"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Operator token
          <input
            className="rounded border border-slate-300 px-3 py-2 font-normal text-slate-950"
            type="password"
            value={operatorToken}
            minLength={32}
            maxLength={256}
            onChange={(event) => setOperatorToken(event.target.value)}
            placeholder="Enter the server-configured operator token"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          className="w-fit rounded border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
          type="submit"
          disabled={!enabled || state.status === "sending"}
        >
          Send Live Test SMS
        </button>
        {state.status === "failed" ? (
          <button
            className="w-fit text-sm font-medium text-teal-800 underline"
            type="button"
            onClick={explicitlyStartNewRequest}
          >
            Start a deliberate new request
          </button>
        ) : null}
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
