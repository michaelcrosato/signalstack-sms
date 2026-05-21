"use client";

import { CampaignStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
    <div className="grid gap-5">
      <form className="grid gap-4" onSubmit={updateCampaign}>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Campaign name
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950 disabled:bg-slate-100"
            disabled={!campaign.canEdit || pending}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Template
          <select
            className="rounded border border-slate-300 px-3 py-2 text-slate-950 disabled:bg-slate-100"
            disabled={!campaign.canEdit || pending}
            onChange={(event) => onTemplateChange(event.target.value)}
            value={templateId}
          >
            <option value="">Custom copy</option>
            {campaign.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Message body
          <textarea
            className="min-h-36 rounded border border-slate-300 px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
            disabled={!campaign.canEdit || pending}
            onChange={(event) => setBody(event.target.value)}
            value={body}
          />
        </label>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-slate-700">Recipients</legend>
          <div className="grid max-h-60 gap-2 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3">
            {campaign.contacts.map((contact) => (
              <label className="flex items-start gap-3 text-sm text-slate-700" key={contact.id}>
                <input
                  checked={contactIds.includes(contact.id)}
                  className="mt-1"
                  disabled={!campaign.canEdit || contact.disabled || pending}
                  onChange={() => toggleContact(contact.id)}
                  type="checkbox"
                />
                <span>
                  <span className="block font-medium text-slate-950">{contact.displayName}</span>
                  <span className="block text-slate-600">
                    {contact.phone} - {contact.consentStatus}
                    {contact.disabled ? " - blocked for sends" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={!campaign.canEdit || pending || contactIds.length === 0}
            type="submit"
          >
            {pending ? "Saving" : "Save Draft"}
          </button>
          <p className="text-sm text-slate-600">
            Draft edits are local only. Non-draft campaigns are locked from editing.
          </p>
        </div>
      </form>

      <section className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-lg font-semibold text-slate-950">Lifecycle control</h3>
        <p className="text-sm text-slate-600">
          Canceling pauses the campaign and cancels queued local jobs. It does not call providers, send SMS, notify
          users, bill, or run workers.
        </p>
        <button
          className="w-fit rounded border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:text-slate-400"
          disabled={!campaign.canCancel || pending}
          onClick={cancelCampaign}
          type="button"
        >
          Cancel Scheduled Campaign
        </button>
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
  );
}
