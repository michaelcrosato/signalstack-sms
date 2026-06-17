"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { productCampaignComposerDefaults } from "@/lib/product/campaign-composer-defaults";

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
  allowedRecipients: number;
  blockedRecipients: number;
  recipients: Array<{ contactId: string; allowed: boolean; reasons: string[] }>;
};

type AiCopyResult = {
  provider: "fake";
  variants: string[];
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
  const [name, setName] = useState<string>(productCampaignComposerDefaults.name);
  const [body, setBody] = useState<string>(firstTemplate?.body ?? productCampaignComposerDefaults.body);
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? "");
  const [contactIds, setContactIds] = useState<string[]>(readyContacts.slice(0, 3).map((contact) => contact.id));
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [copyPrompt, setCopyPrompt] = useState<string>(productCampaignComposerDefaults.copyPrompt);
  const [copyVariants, setCopyVariants] = useState<string[]>([]);
  const [aiPending, setAiPending] = useState(false);
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

  async function generateCopy() {
    setAiPending(true);
    setError(null);
    setStatus(null);

    const response = await fetch("/api/ai/campaign-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: copyPrompt,
        businessName: productCampaignComposerDefaults.aiBusinessName,
        tone: productCampaignComposerDefaults.aiTone
      })
    });
    const payload = (await response.json()) as AiCopyResult | { error?: string };

    if (!response.ok || !("variants" in payload)) {
      setError(("error" in payload && payload.error) || "Fake AI copy could not be generated.");
      setAiPending(false);
      return;
    }

    setCopyVariants(payload.variants);
    setStatus("Fake AI copy generated locally. Live AI remains blocked.");
    setAiPending(false);
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
    setStatus("Draft saved. Preflight is ready.");
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

        <section aria-label="Fake AI copy assist" className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-4">
          <div>
            <h3 className="font-semibold text-slate-950">Fake AI copy assist</h3>
            <p className="mt-1 text-sm text-slate-600">
              Generates deterministic local copy only. Live AI providers stay blocked.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Copy prompt
            <input
              className="rounded border border-slate-300 bg-white px-3 py-2 text-slate-950"
              onChange={(event) => setCopyPrompt(event.target.value)}
              value={copyPrompt}
            />
          </label>
          <button
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={aiPending || copyPrompt.trim().length === 0}
            onClick={generateCopy}
            type="button"
          >
            {aiPending ? "Generating" : "Generate Fake Copy"}
          </button>
          {copyVariants.length > 0 ? (
            <div className="grid gap-2">
              {copyVariants.map((variant, index) => (
                <div className="grid gap-2 rounded border border-slate-200 bg-white p-3" key={`${variant}-${index}`}>
                  <p className="text-sm text-slate-700">{variant}</p>
                  <button
                    className="justify-self-start rounded border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-700"
                    onClick={() => setBody(variant)}
                    type="button"
                  >
                    Use Variant {index + 1}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

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
              <dd className="font-medium">{preflight.allowedRecipients}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Blocked recipients</dt>
              <dd className="font-medium">{preflight.blockedRecipients}</dd>
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
