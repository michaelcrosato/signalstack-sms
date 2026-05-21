"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type ComposerContact = {
  id: string;
  displayName: string;
  phone: string;
  consentStatus: string;
  disabled: boolean;
};

type ComposerTemplate = {
  id: string;
  name: string;
  body: string;
};

type PreflightResult = {
  allowed: boolean;
  allowedCount: number;
  blockedCount: number;
  recipients: Array<{ contactId: string; allowed: boolean; reasons: string[] }>;
};

const defaultSchedule = () => {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000);
  nextHour.setMinutes(0, 0, 0);
  return nextHour.toISOString().slice(0, 16);
};

export function CampaignComposer({ contacts, templates }: { contacts: ComposerContact[]; templates: ComposerTemplate[] }) {
  const router = useRouter();
  const firstTemplate = templates[0];
  const readyContacts = useMemo(() => contacts.filter((contact) => !contact.disabled), [contacts]);
  const [name, setName] = useState("Product demo campaign");
  const [body, setBody] = useState(firstTemplate?.body ?? "Hi {{firstName}}, this is SignalStack Demo Co. Reply STOP to opt out.");
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? "");
  const [contactIds, setContactIds] = useState<string[]>(readyContacts.slice(0, 3).map((contact) => contact.id));
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const nextTemplate = templates.find((template) => template.id === nextTemplateId);
    if (nextTemplate) {
      setBody(nextTemplate.body);
    }
  }

  function toggleContact(contactId: string) {
    setContactIds((current) =>
      current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId]
    );
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setStatus(null);
    setPreflight(null);

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body, templateId: templateId || undefined, contactIds })
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Campaign draft could not be created.");
      setPending(false);
      return;
    }

    const nextCampaignId = payload.campaign.id as string;
    setCampaignId(nextCampaignId);
    setStatus("Draft saved. Preflight is ready.");

    const preflightResponse = await fetch(`/api/campaigns/${nextCampaignId}/preflight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const preflightPayload = await preflightResponse.json();

    if (!preflightResponse.ok) {
      setError(preflightPayload.error ?? "Campaign preflight failed.");
      setPending(false);
      return;
    }

    setPreflight(preflightPayload.preflight);
    setPending(false);
    router.refresh();
  }

  async function scheduleCampaign() {
    if (!campaignId) {
      return;
    }

    setPending(true);
    setError(null);
    setStatus(null);

    const response = await fetch(`/api/campaigns/${campaignId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString() })
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Campaign schedule failed.");
      setPending(false);
      return;
    }

    setStatus("Campaign scheduled locally. No provider sends ran.");
    setPending(false);
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      <form className="grid gap-4" onSubmit={createCampaign}>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Campaign name
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Template
          <select
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => onTemplateChange(event.target.value)}
            value={templateId}
          >
            <option value="">Custom copy</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Message body
          <textarea
            className="min-h-32 rounded border border-slate-300 px-3 py-2 text-sm text-slate-950"
            onChange={(event) => setBody(event.target.value)}
            value={body}
          />
        </label>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-slate-700">Recipients</legend>
          <div className="grid max-h-52 gap-2 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3">
            {contacts.map((contact) => (
              <label className="flex items-start gap-3 text-sm text-slate-700" key={contact.id}>
                <input
                  checked={contactIds.includes(contact.id)}
                  className="mt-1"
                  disabled={contact.disabled}
                  onChange={() => toggleContact(contact.id)}
                  type="checkbox"
                />
                <span>
                  <span className="block font-medium text-slate-950">{contact.displayName}</span>
                  <span className="block text-slate-600">
                    {contact.phone} · {contact.consentStatus}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={pending || contactIds.length === 0}
          type="submit"
        >
          {pending ? "Saving" : "Save Draft And Preflight"}
        </button>
      </form>

      <section aria-label="Campaign preflight" className="rounded border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-semibold text-slate-950">Preflight</h3>
        {preflight ? (
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Allowed recipients</dt>
              <dd className="font-medium">{preflight.allowedCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Blocked recipients</dt>
              <dd className="font-medium">{preflight.blockedCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Live sends</dt>
              <dd className="font-medium">blocked by default</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Save a draft to run local consent and opt-out checks.</p>
        )}
      </section>

      <section className="grid gap-3 rounded border border-slate-200 bg-white p-4">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Schedule time
          <input
            className="rounded border border-slate-300 px-3 py-2 text-slate-950"
            onChange={(event) => setScheduledAt(event.target.value)}
            type="datetime-local"
            value={scheduledAt}
          />
        </label>
        <button
          className="rounded border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
          disabled={pending || !campaignId || !preflight?.allowed}
          onClick={scheduleCampaign}
          type="button"
        >
          Schedule Locally
        </button>
        <p className="text-sm text-slate-600">Scheduling writes a local queue job only. Campaign sending remains gated.</p>
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
