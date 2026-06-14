"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
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
    key: "thread" | "consent" | "lead" | "sentiment" | "category";
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
      <div className="glass-card overflow-hidden h-fit">
        <div className="border-b border-white/5 p-5">
          <h2 className="text-xl font-bold font-display text-white">Conversation list</h2>
          <p className="mt-1 text-xs text-slate-400">Most recent tenant-scoped threads from the existing inbox API model.</p>
        </div>
        <div className="divide-y divide-white/5">
          {conversations.map((conversation) => (
            <Link
              aria-current={conversation.selected ? "page" : undefined}
              aria-label={`Open conversation with ${conversation.contactName}`}
              className={
                conversation.selected
                  ? "grid gap-2 bg-teal-500/10 border-l-2 border-teal-500 p-4 text-left shadow-[inset_0_0_15px_rgba(20,184,166,0.05)]"
                  : "grid gap-2 bg-transparent p-4 text-left transition hover:bg-white/5"
              }
              href={`/dashboard/inbox?conversationId=${encodeURIComponent(conversation.id)}`}
              key={conversation.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{conversation.contactName}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{conversation.phone}</p>
                </div>
                <span className="rounded border border-white/10 bg-slate-900/60 px-2 py-1 text-xs font-semibold text-slate-300">
                  {conversation.status}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-slate-300">{conversation.latestMessage}</p>
              <dl className="grid gap-1 text-[11px] text-slate-400 border-t border-white/5 pt-2 mt-1">
                <div className="flex justify-between gap-3">
                  <dt>Assigned</dt>
                  <dd className="font-medium text-slate-300">{conversation.assignedTo}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Consent</dt>
                  <dd className="font-medium text-slate-300">{conversation.consentStatus}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6">
        <section className="glass-card overflow-hidden">
          <div className="border-b border-white/5 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold font-display text-white">Thread</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedConversation
                    ? `${selectedConversation.contactName} · ${selectedConversation.phone}`
                    : "No conversations yet"}
                </p>
                {selectedConversation ? (
                  <dl aria-label="Thread status" className="mt-2.5 flex flex-wrap gap-2 text-xs font-semibold">
                    {selectedConversation.statusRows.map((row) => {
                      const value = row.key === "thread" ? threadStatus : row.value;
                      let themeClasses = "border-white/10 bg-slate-900/60 text-slate-300";
                      if (row.key === "sentiment") {
                        if (value === "POSITIVE") {
                          themeClasses = "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
                        } else if (value === "NEGATIVE") {
                          themeClasses = "border-rose-500/20 bg-rose-500/10 text-rose-300";
                        } else if (value === "NEUTRAL") {
                          themeClasses = "border-sky-500/20 bg-sky-500/10 text-sky-300";
                        }
                      } else if (row.key === "category" && value !== "Not categorized") {
                        themeClasses = "border-violet-500/20 bg-violet-500/10 text-violet-300";
                      }
                      return (
                        <div
                          className={`inline-flex gap-1 rounded border px-2 py-1 ${themeClasses}`}
                          key={row.key}
                        >
                          <dt className="opacity-80">{row.label}:</dt>
                          <dd>{value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
              </div>
              {selectedConversation ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition duration-200 disabled:opacity-40"
                    disabled={pending || selectedConversation.assignedToUserId === currentUserId}
                    onClick={assignToMe}
                    type="button"
                  >
                    Assign To Me
                  </button>
                  <button
                    className="rounded-xl border border-teal-500 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 transition duration-200 disabled:opacity-40 shadow-[0_0_15px_rgba(20,184,166,0.1)]"
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

          <div className="grid gap-3.5 p-5 max-h-[450px] overflow-y-auto bg-slate-950/20">
            {orderedMessages.map((message) => (
              <article
                className={`rounded-2xl border p-4 max-w-[85%] ${
                  message.direction === "OUTBOUND"
                    ? "border-indigo-500/10 bg-indigo-500/5 ml-auto"
                    : "border-white/5 bg-slate-900/40"
                }`}
                key={message.id}
              >
                <div className="flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>{message.direction}</span>
                  <span className="font-medium text-slate-500">{new Date(message.createdAt).toLocaleString("en-US")}</span>
                </div>
                <p className="mt-2 text-sm text-slate-200 leading-6">{message.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold font-display text-white">Fake AI insights</h2>
              <p className="mt-1 text-xs text-slate-400">
                Generates deterministic local summary and lead score only; live AI providers stay blocked.
              </p>
            </div>
            <button
              className="rounded-xl bg-teal-500/10 border border-teal-500/30 px-4 py-2 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 transition duration-200 disabled:opacity-40"
              disabled={aiPending || !selectedConversation}
              onClick={generateAiInsights}
              type="button"
            >
              {aiPending ? "Generating..." : "Generate Fake AI Insights"}
            </button>
          </div>

          {aiInsights ? (
            <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr_1fr]">
              <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2">Summary</h3>
                <p className="mt-2.5 text-xs text-slate-200 leading-5">{aiInsights.summary}</p>
              </article>
              <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2">Lead qualification</h3>
                <dl className="mt-2.5 grid gap-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Stage</dt>
                    <dd className="font-semibold text-white">{aiInsights.stage}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Score</dt>
                    <dd className="font-semibold text-white">{aiInsights.score}</dd>
                  </div>
                </dl>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] text-slate-300 border-t border-white/5 pt-2">
                  {aiInsights.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </article>
            </div>
          ) : null}
        </section>

        <form className="grid gap-3 glass-card p-5" onSubmit={sendReply}>
          <h2 className="text-xl font-bold font-display text-white">Send reply</h2>
          <p className="text-xs text-slate-400">
            Records a local OUTBOUND message via the dummy provider. Opted-out or archived contacts are blocked; no live SMS is sent.
          </p>
          <label className="grid gap-2 text-xs font-semibold text-slate-300">
            Reply message
            <textarea
              className="min-h-28 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 transition"
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="Type a reply to record via the demo-safe dummy provider"
              value={replyBody}
            />
          </label>
          <button
            className="rounded-xl bg-teal-600 hover:bg-teal-500 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={pending || !selectedConversation || replyBody.trim().length === 0}
            type="submit"
          >
            Send Reply
          </button>
        </form>

        <section className="grid gap-6 md:grid-cols-2">
          <form className="grid gap-3 glass-card p-5" onSubmit={addInboundMessage}>
            <h2 className="text-xl font-bold font-display text-white">Demo inbound</h2>
            <p className="text-xs text-slate-400">Creates a local inbound message only; SMS providers remain blocked.</p>
            <label className="grid gap-2 text-xs font-semibold text-slate-300">
              Reply body
              <textarea
                className="min-h-28 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                onChange={(event) => setMessageBody(event.target.value)}
                value={messageBody}
              />
            </label>
            <button
              className="rounded-xl bg-teal-600 hover:bg-teal-500 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={pending || !selectedConversation || messageBody.trim().length === 0}
              type="submit"
            >
              Add Local Reply
            </button>
          </form>

          <form className="grid gap-3 glass-card p-5" onSubmit={addNote}>
            <h2 className="text-xl font-bold font-display text-white">Internal note</h2>
            <p className="text-xs text-slate-400">Stores a tenant-scoped note for team handoff.</p>
            <label className="grid gap-2 text-xs font-semibold text-slate-300">
              Note body
              <textarea
                className="min-h-28 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                onChange={(event) => setNoteBody(event.target.value)}
                value={noteBody}
              />
            </label>
            <button
              className="rounded-xl border border-teal-500 bg-teal-500/10 px-4 py-2 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={pending || !selectedConversation || noteBody.trim().length === 0}
              type="submit"
            >
              Add Note
            </button>
          </form>
        </section>

        <section className="glass-card p-5">
          <h2 className="text-xl font-bold font-display text-white">Notes</h2>
          <div className="mt-3.5 grid gap-3 max-h-[300px] overflow-y-auto">
            {(selectedConversation?.notes ?? []).map((note) => (
              <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-4" key={note.id}>
                <p className="text-xs text-slate-200 leading-5">{note.body}</p>
                <p className="mt-2 text-[10px] text-slate-400 font-medium">
                  {note.authorName} · {new Date(note.createdAt).toLocaleString("en-US")}
                </p>
              </article>
            ))}
          </div>
        </section>

        {status ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-300" role="status">
            {status}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-medium text-rose-300" role="alert">
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
