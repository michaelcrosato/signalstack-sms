"use client";

import type { CampaignStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type CampaignDetail = {
  id: string;
  name: string;
  body: string;
  status: CampaignStatus;
  templateId: string;
  canEdit: boolean;
  canCancel: boolean;
  selectedContactIds: string[];
  contacts: Array<{
    id: string;
    displayName: string;
    phone: string;
    consentStatus: string;
    disabled: boolean;
    selected: boolean;
  }>;
  templates: Array<{
    id: string;
    name: string;
    body: string;
  }>;
};

type CampaignDetailFormProps = {
  campaign: CampaignDetail;
};

export function CampaignDetailForm({ campaign }: CampaignDetailFormProps) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [body, setBody] = useState(campaign.body);
  const [templateId, setTemplateId] = useState(campaign.templateId);
  const [contactIds, setContactIds] = useState(campaign.selectedContactIds);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const template = campaign.templates.find((candidate) => candidate.id === nextTemplateId);
    if (template) {
      setBody(template.body);
    }
  }

  function toggleContact(contactId: string) {
    setContactIds((current) =>
      current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId]
    );
  }

  async function updateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        body,
        templateId: templateId || undefined,
        contactIds
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Campaign could not be updated.");
      setPending(false);
      return;
    }

    setStatus("Campaign draft updated locally. Run preflight again before scheduling.");
    setPending(false);
    router.refresh();
  }

  async function cancelCampaign() {
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(`/api/campaigns/${campaign.id}/cancel`, { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Campaign could not be canceled.");
      setPending(false);
      return;
    }

    setStatus("Campaign queue job canceled locally. No provider sends ran.");
    setPending(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-5" onSubmit={updateCampaign}>
        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Campaign name
          <input
            className="rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition disabled:bg-slate-950/60 disabled:text-slate-500"
            disabled={!campaign.canEdit || pending}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>

        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Template
          <select
            className="rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition disabled:bg-slate-950/60 disabled:text-slate-500"
            disabled={!campaign.canEdit || pending}
            onChange={(event) => onTemplateChange(event.target.value)}
            value={templateId}
          >
            <option value="" className="bg-slate-950 text-white">Custom copy</option>
            {campaign.templates.map((template) => (
              <option key={template.id} value={template.id} className="bg-slate-950 text-white">
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Message body
          <textarea
            className="min-h-36 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition disabled:bg-slate-950/60 disabled:text-slate-500"
            disabled={!campaign.canEdit || pending}
            onChange={(event) => setBody(event.target.value)}
            value={body}
          />
        </label>

        <fieldset className="grid gap-3 border-t border-white/5 pt-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recipients</legend>
          <div className="grid max-h-60 gap-2.5 overflow-y-auto rounded-2xl border border-white/5 bg-slate-900/30 p-4">
            {campaign.contacts.map((contact) => (
              <label className="flex items-start gap-3 text-xs text-slate-300" key={contact.id}>
                <input
                  checked={contactIds.includes(contact.id)}
                  className="mt-1 accent-teal-500"
                  disabled={!campaign.canEdit || contact.disabled || pending}
                  onChange={() => toggleContact(contact.id)}
                  type="checkbox"
                />
                <span>
                  <span className="block font-bold text-white">{contact.displayName}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    {contact.phone} - {contact.consentStatus}
                    {contact.disabled ? " - blocked for sends" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4 border-t border-white/5 pt-4">
          <button
            className="rounded-xl bg-teal-600 hover:bg-teal-500 px-5 py-2.5 text-xs font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!campaign.canEdit || pending || contactIds.length === 0}
            type="submit"
          >
            {pending ? "Saving" : "Save Draft"}
          </button>
          <p className="text-xs text-slate-400">
            Draft edits are local only. Non-draft campaigns are locked from editing.
          </p>
        </div>
      </form>

      <section className="grid gap-3 rounded-2xl border border-white/5 bg-slate-900/30 p-5">
        <h3 className="text-lg font-bold font-display text-white">Lifecycle control</h3>
        <p className="text-xs text-slate-400 leading-5">
          Canceling pauses the campaign and cancels queued local jobs. It does not call providers, send SMS, notify
          users, bill, or run workers.
        </p>
        <button
          className="w-fit rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!campaign.canCancel || pending}
          onClick={cancelCampaign}
          type="button"
        >
          Cancel Scheduled Campaign
        </button>
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
  );
}
