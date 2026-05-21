"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type InboxConversationRow = {
  id: string;
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
  const [messageBody, setMessageBody] = useState("YES, please send the starter plan details.");
  const [noteBody, setNoteBody] = useState("Follow up with pricing context after demo.");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [localThreadStatus, setLocalThreadStatus] = useState(selectedConversation?.status ?? "OPEN");
  const threadStatus = localThreadStatus;
  const orderedMessages = useMemo(() => selectedConversation?.messages ?? [], [selectedConversation]);

  async function submitJson(path: string, body: unknown, successMessage: string, refresh = true) {
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

    setStatus(successMessage);
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
      "Local inbound reply added. No provider send ran."
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

  return (
    <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
      <div className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-semibold">Conversation list</h2>
          <p className="mt-1 text-sm text-slate-600">Most recent tenant-scoped threads from the existing inbox API model.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {conversations.map((conversation) => (
            <article className="grid gap-2 p-4" key={conversation.id}>
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
            </article>
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
                  <span className="mt-2 inline-flex rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold">
                    {threadStatus}
                  </span>
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
