"use client";

import { ConsentStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { productContactConsentOptions } from "@/lib/product/contact-consent-options";

type ContactDetailFormProps = {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    displayName: string;
    consentStatus: ConsentStatus;
    optInSource: string;
    source: string;
    notes: string;
    tags: string[];
    lists: string[];
    archived: boolean;
    mergeCandidates: Array<{
      id: string;
      displayName: string;
      phone: string;
      consentStatus: ConsentStatus;
      tags: string[];
      lists: string[];
    }>;
  };
};

export function ContactDetailForm({ contact }: ContactDetailFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName);
  const [displayName, setDisplayName] = useState(contact.displayName);
  const [email, setEmail] = useState(contact.email);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(
    contact.consentStatus,
  );
  const [optInSource, setOptInSource] = useState(contact.optInSource);
  const [source, setSource] = useState(contact.source);
  const [notes, setNotes] = useState(contact.notes);
  const [tagNames, setTagNames] = useState(contact.tags.join(", "));
  const [listNames, setListNames] = useState(contact.lists.join(", "));
  const [sourceContactId, setSourceContactId] = useState(
    contact.mergeCandidates[0]?.id ?? "",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        cleanPayload({
          firstName,
          lastName,
          displayName,
          email,
          consentStatus,
          optInSource,
          source,
          notes,
          tagNames: splitLabels(tagNames),
          listNames: splitLabels(listNames),
        }),
      ),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Contact could not be updated.");
      setPending(false);
      return;
    }

    setStatus(
      "Contact updated locally. Campaign sends remain gated by preflight.",
    );
    setPending(false);
    router.refresh();
  }

  async function archiveContact() {
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(`/api/contacts/${contact.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "Contact could not be archived.");
      setPending(false);
      return;
    }

    router.push("/dashboard/contacts");
    router.refresh();
  }

  async function restoreContact() {
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Contact could not be restored.");
      setPending(false);
      return;
    }

    setStatus(
      "Contact restored locally. Campaign sends still require consent and preflight.",
    );
    setPending(false);
    router.refresh();
  }

  async function mergeContact() {
    if (!sourceContactId) {
      setError("Choose a source contact to merge.");
      return;
    }

    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(`/api/contacts/${contact.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceContactId }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Contacts could not be merged.");
      setPending(false);
      return;
    }

    setStatus("Contacts merged locally. The source contact was soft-archived.");
    setPending(false);
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          First name
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setFirstName(event.target.value)}
            value={firstName}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Last name
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setLastName(event.target.value)}
            value={lastName}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Display name
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Email
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Consent status
          <select
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) =>
              setConsentStatus(event.target.value as ConsentStatus)
            }
            value={consentStatus}
          >
            {productContactConsentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Opt-in source
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setOptInSource(event.target.value)}
            value={optInSource}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Contact source
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setSource(event.target.value)}
            value={source}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Tags
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setTagNames(event.target.value)}
            value={tagNames}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
          Lists
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setListNames(event.target.value)}
            value={listNames}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
          Notes
          <textarea
            className="min-h-32 rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving" : "Save Contact"}
        </button>
        {contact.archived ? (
          <button
            className="rounded border border-teal-300 px-4 py-2 text-sm font-semibold text-teal-700 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={pending}
            onClick={restoreContact}
            type="button"
          >
            Restore Contact
          </button>
        ) : (
          <button
            className="rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={pending}
            onClick={archiveContact}
            type="button"
          >
            Archive Contact
          </button>
        )}
        <p className="text-sm text-slate-600">
          Local metadata only. No provider calls, SMS, live AI, or billing
          actions run.
        </p>
      </div>

      {status ? (
        <div
          className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
          role="status"
        >
          {status}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 border-t border-slate-200 pt-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            Merge duplicate
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Merge another active contact into this one. The source contact is
            soft-archived and no SMS, billing, AI, or provider work runs.
          </p>
        </div>
        {contact.mergeCandidates.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Source contact
              <select
                className="rounded border border-slate-300 px-3 py-2 text-slate-950"
                onChange={(event) => setSourceContactId(event.target.value)}
                value={sourceContactId}
              >
                {contact.mergeCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName} - {candidate.phone} -{" "}
                    {candidate.consentStatus}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={pending}
              onClick={mergeContact}
              type="button"
            >
              Merge Into This Contact
            </button>
          </div>
        ) : (
          <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No other active contacts are available to merge.
          </p>
        )}
      </section>
    </form>
  );
}

function splitLabels(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ];
}

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      return value !== undefined;
    }),
  );
}
