"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { productInboxWorkspaceDefaults } from "@/lib/product/inbox-workspace-defaults";

type InboxConversationRow = {
  id: string;
  selected: boolean;
  status: string;
  contactName: string;
  phone: string;
  consentStatus: string;
  assignedTo: string;
  latestMessage: string;
  lastMessageAt: string;
};

type InboxMessage = {
  id: string;
  direction: string;
  body: string;
  providerStatus: string | null;
  createdAt: string;
};

type InboxNote = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

type SelectedConversation = {
  id: string;
  status: string;
  contactName: string;
  phone: string;
  consentStatus: string;
  assignedTo: string;
  assignedToUserId: string | null;
  notes: InboxNote[];
  messages: InboxMessage[];
  statusRows: Array<{
    key: "thread" | "consent";
    label: string;
    value: string;
  }>;
};

type AiInsights = {
  summary: string;
  stage: string;
  score: number;
  reasons: string[];
};

export function InboxWorkspace({
  conversations,
  currentUserId,
  selectedConversation
}: {
  conversations: InboxConversationRow[];
  currentUserId: string;
  selectedConversation: SelectedConversation | null;
}) {
  const router = useRouter();
  const [messageBody, setMessageBody] = useState<string>(productInboxWorkspaceDefaults.inboundReply);
  const [noteBody, setNoteBody] = useState<string>(productInboxWorkspaceDefaults.internalNote);
  const [replyBody, setReplyBody] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [localThreadStatus, setLocalThreadStatus] = useState(selectedConversation?.status ?? "OPEN");
  const threadStatus = localThreadStatus;
  const orderedMessages = useMemo(() => selectedConversation?.messages ?? [], [selectedConversation]);

  async function submitJson(
    path: string,
    body: unknown,
    successMessage: string | ((payload: Record<string, unknown>) => string),
    refresh = true
  ) {
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Inbox action failed.");
      setPending(false);
      return;
    }

    setStatus(typeof successMessage === "function" ? successMessage(payload) : successMessage);
    setPending(false);
    if (refresh) {
      router.refresh();
    }
  }

  function addInboundMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation) {
      return;
    }

    void submitJson(
      `/api/inbox/conversations/${selectedConversation.id}/messages`,
      { body: messageBody },
      (payload) => inboundStatusMessage(payload)
    );
  }

  function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation) {
      return;
    }

    void submitJson(
      `/api/inbox/conversations/${selectedConversation.id}/reply`,
      { body: replyBody },
      (payload) =>
        payload.deduped
          ? "Duplicate reply ignored (idempotent). No provider send ran."
          : "Local outbound reply recorded via the dummy provider. No live SMS was sent."
    );
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation) {
      return;
    }

    void submitJson(
      `/api/inbox/conversations/${selectedConversation.id}/notes`,
      { body: noteBody },
      "Internal note added."
    );
  }

  function assignToMe() {
    if (!selectedConversation) {
      return;
    }

    void submitJson(
      `/api/inbox/conversations/${selectedConversation.id}/assign`,
      { assignedToUserId: currentUserId },
      "Conversation assigned to you."
    );
  }

  function setResolved(resolved: boolean) {
    if (!selectedConversation) {
      return;
    }

    setLocalThreadStatus(resolved ? "RESOLVED" : "OPEN");
    void submitJson(
      `/api/inbox/conversations/${selectedConversation.id}/resolve`,
      { resolved },
      resolved ? "Conversation resolved." : "Conversation reopened.",
      false
    );
  }

  async function generateAiInsights() {
    if (!selectedConversation) {
      return;
    }

    setAiPending(true);
    setStatus(null);
    setError(null);

    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedConversation.id })
    };
    const [summaryResponse, qualificationResponse] = await Promise.all([
      fetch("/api/ai/conversation-summary", request),
      fetch("/api/ai/lead-qualification", request)
    ]);
    const [summaryPayload, qualificationPayload] = await Promise.all([
      summaryResponse.json().catch(() => ({})),
      qualificationResponse.json().catch(() => ({}))
    ]);

    if (!summaryResponse.ok || !qualificationResponse.ok) {
      const message =
        typeof summaryPayload.error === "string"
          ? summaryPayload.error
          : typeof qualificationPayload.error === "string"
            ? qualificationPayload.error
            : "Fake AI insights failed.";
      setError(message);
      setAiPending(false);
      return;
    }

    const reasonsPayload: unknown = qualificationPayload.reasons;

    setAiInsights({
      summary: typeof summaryPayload.summary === "string" ? summaryPayload.summary : "No summary returned.",
      stage: typeof qualificationPayload.stage === "string" ? qualificationPayload.stage : "UNKNOWN",
      score: typeof qualificationPayload.score === "number" ? qualificationPayload.score : 0,
      reasons: Array.isArray(reasonsPayload)
        ? reasonsPayload.filter((reason: unknown): reason is string => typeof reason === "string")
        : []
    });
    setStatus("Fake AI inbox insights generated locally. Live AI remains blocked.");
    setAiPending(false);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
      <div className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-semibold">Conversation list</h2>
          <p className="mt-1 text-sm text-slate-600">Most recent tenant-scoped threads from the existing inbox API model.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {conversations.map((conversation) => (
            <Link
              aria-current={conversation.selected ? "page" : undefined}
              aria-label={`Open conversation with ${conversation.contactName}`}
              className={
                conversation.selected
                  ? "grid gap-2 bg-teal-50 p-4 text-left"
                  : "grid gap-2 bg-white p-4 text-left transition hover:bg-slate-50"
              }
              href={`/dashboard/inbox?conversationId=${encodeURIComponent(conversation.id)}`}
              key={conversation.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{conversation.contactName}</h3>
                  <p className="text-sm text-slate-600">{conversation.phone}</p>
                </div>
                <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold">
                  {conversation.status}
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-slate-700">{conversation.latestMessage}</p>
              <dl className="grid gap-1 text-xs text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>Assigned</dt>
                  <dd>{conversation.assignedTo}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Consent</dt>
                  <dd>{conversation.consentStatus}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6">
        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Thread</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedConversation
                    ? `${selectedConversation.contactName} · ${selectedConversation.phone}`
                    : "No conversations yet"}
                </p>
                {selectedConversation ? (
                  <dl aria-label="Thread status" className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    {selectedConversation.statusRows.map((row) => (
                      <div
                        className="inline-flex gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1"
                        key={row.key}
                      >
                        <dt>{row.label}</dt>
                        <dd>{row.key === "thread" ? threadStatus : row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
              {selectedConversation ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:text-slate-400"
                    disabled={pending || selectedConversation.assignedToUserId === currentUserId}
                    onClick={assignToMe}
                    type="button"
                  >
                    Assign To Me
                  </button>
                  <button
                    className="rounded border border-teal-700 px-3 py-2 text-sm font-medium text-teal-700 disabled:border-slate-300 disabled:text-slate-400"
                    disabled={pending}
                    onClick={() => setResolved(threadStatus !== "RESOLVED")}
                    type="button"
                  >
                    {threadStatus === "RESOLVED" ? "Reopen" : "Resolve"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 p-5">
            {orderedMessages.map((message) => (
              <article
                className="rounded border border-slate-200 bg-slate-50 p-4"
                key={message.id}
              >
                <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>{message.direction}</span>
                  <span>{new Date(message.createdAt).toLocaleString("en-US")}</span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{message.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Fake AI insights</h2>
              <p className="mt-1 text-sm text-slate-600">
                Generates deterministic local summary and lead score only; live AI providers stay blocked.
              </p>
            </div>
            <button
              className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={aiPending || !selectedConversation}
              onClick={generateAiInsights}
              type="button"
            >
              {aiPending ? "Generating..." : "Generate Fake AI Insights"}
            </button>
          </div>

          {aiInsights ? (
            <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr_1fr]">
              <article className="rounded border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
                <p className="mt-2 text-sm text-slate-800">{aiInsights.summary}</p>
              </article>
              <article className="rounded border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lead qualification</h3>
                <dl className="mt-2 grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Stage</dt>
                    <dd className="font-semibold text-slate-950">{aiInsights.stage}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Score</dt>
                    <dd className="font-semibold text-slate-950">{aiInsights.score}</dd>
                  </div>
                </dl>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {aiInsights.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </article>
            </div>
          ) : null}
        </section>

        <form className="grid gap-3 rounded border border-slate-200 bg-white p-5" onSubmit={sendReply}>
          <h2 className="text-xl font-semibold">Send reply</h2>
          <p className="text-sm text-slate-600">
            Records a local OUTBOUND message via the dummy provider. Opted-out or archived contacts are blocked; no live SMS is sent.
          </p>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Reply message
            <textarea
              className="min-h-28 rounded border border-slate-300 px-3 py-2 text-sm text-slate-950"
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="Type a reply to record via the demo-safe dummy provider"
              value={replyBody}
            />
          </label>
          <button
            className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={pending || !selectedConversation || replyBody.trim().length === 0}
            type="submit"
          >
            Send Reply
          </button>
        </form>

        <section className="grid gap-6 md:grid-cols-2">
          <form className="grid gap-3 rounded border border-slate-200 bg-white p-5" onSubmit={addInboundMessage}>
            <h2 className="text-xl font-semibold">Demo inbound</h2>
            <p className="text-sm text-slate-600">Creates a local inbound message only; SMS providers remain blocked.</p>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Reply body
              <textarea
                className="min-h-28 rounded border border-slate-300 px-3 py-2 text-sm text-slate-950"
                onChange={(event) => setMessageBody(event.target.value)}
                value={messageBody}
              />
            </label>
            <button
              className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={pending || !selectedConversation || messageBody.trim().length === 0}
              type="submit"
            >
              Add Local Reply
            </button>
          </form>

          <form className="grid gap-3 rounded border border-slate-200 bg-white p-5" onSubmit={addNote}>
            <h2 className="text-xl font-semibold">Internal note</h2>
            <p className="text-sm text-slate-600">Stores a tenant-scoped note for team handoff.</p>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Note body
              <textarea
                className="min-h-28 rounded border border-slate-300 px-3 py-2 text-sm text-slate-950"
                onChange={(event) => setNoteBody(event.target.value)}
                value={noteBody}
              />
            </label>
            <button
              className="rounded border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
              disabled={pending || !selectedConversation || noteBody.trim().length === 0}
              type="submit"
            >
              Add Note
            </button>
          </form>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold">Notes</h2>
          <div className="mt-3 grid gap-3">
            {(selectedConversation?.notes ?? []).map((note) => (
              <article className="rounded border border-slate-200 bg-slate-50 p-3 text-sm" key={note.id}>
                <p className="text-slate-800">{note.body}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {note.authorName} · {new Date(note.createdAt).toLocaleString("en-US")}
                </p>
              </article>
            ))}
          </div>
        </section>

        {status ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" role="status">
            {status}
          </div>
        ) : null}
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-950" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function inboundStatusMessage(payload: Record<string, unknown>) {
  if (payload.keywordAction === "HELP") {
    return "Local HELP/INFO request recorded. Consent stayed unchanged and no provider send ran.";
  }

  if (payload.keywordAction === "OPT_OUT") {
    return "Local STOP opt-out recorded. No provider send ran.";
  }

  return "Local inbound reply added. No provider send ran.";
}
