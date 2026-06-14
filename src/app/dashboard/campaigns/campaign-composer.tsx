"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
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
    <div className="grid gap-6">
      <form className="grid gap-5" onSubmit={createCampaign}>
        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Campaign name
          <input
            className="rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>

        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Template
          <select
            className="rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            onChange={(event) => onTemplateChange(event.target.value)}
            value={templateId}
          >
            <option value="" className="bg-slate-950 text-white">Custom copy</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id} className="bg-slate-950 text-white">
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <section aria-label="Fake AI copy assist" className="grid gap-4 rounded-2xl border border-white/5 bg-slate-900/30 p-5">
          <div>
            <h3 className="font-bold text-white text-base font-display">Fake AI copy assist</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-5">
              Generates deterministic local copy only. Live AI providers stay blocked.
            </p>
          </div>
          <label className="grid gap-2 text-xs font-semibold text-slate-300">
            Copy prompt
            <input
              className="rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              onChange={(event) => setCopyPrompt(event.target.value)}
              value={copyPrompt}
            />
          </label>
          <button
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={aiPending || copyPrompt.trim().length === 0}
            onClick={generateCopy}
            type="button"
          >
            {aiPending ? "Generating..." : "Generate Fake Copy"}
          </button>
          {copyVariants.length > 0 ? (
            <div className="grid gap-3 mt-2">
              {copyVariants.map((variant, index) => (
                <div className="grid gap-3 rounded-2xl border border-white/5 bg-slate-950 p-4" key={variant}>
                  <p className="text-xs text-slate-300 leading-5">{variant}</p>
                  <button
                    className="justify-self-start rounded-xl border border-teal-500 bg-teal-500/10 px-3.5 py-2 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 transition duration-200"
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

        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Message body
          <textarea
            className="min-h-32 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            onChange={(event) => setBody(event.target.value)}
            value={body}
          />
        </label>

        <fieldset className="grid gap-3 border-t border-white/5 pt-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recipients</legend>
          <div className="grid max-h-52 gap-2.5 overflow-y-auto rounded-2xl border border-white/5 bg-slate-900/30 p-4">
            {contacts.map((contact) => (
              <label className="flex items-start gap-3 text-xs text-slate-300" key={contact.id}>
                <input
                  checked={contactIds.includes(contact.id)}
                  className="mt-1 accent-teal-500"
                  disabled={contact.disabled}
                  onChange={() => toggleContact(contact.id)}
                  type="checkbox"
                />
                <span>
                  <span className="block font-bold text-white">{contact.displayName}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    {contact.phone} · {contact.consentStatus}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="rounded-xl bg-teal-600 hover:bg-teal-500 px-5 py-2.5 text-xs font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={pending || contactIds.length === 0}
          type="submit"
        >
          {pending ? "Saving" : "Save Draft And Preflight"}
        </button>
      </form>

      <section aria-label="Campaign preflight" className="rounded-2xl border border-white/5 bg-slate-900/30 p-5">
        <h3 className="font-bold text-white text-base font-display">Preflight</h3>
        {preflight ? (
          <dl className="mt-3.5 grid gap-2.5 text-xs">
            <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-slate-400">Allowed recipients</dt>
              <dd className="font-semibold text-white">{preflight.allowedRecipients}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-slate-400">Blocked recipients</dt>
              <dd className="font-semibold text-white">{preflight.blockedRecipients}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
              <dt className="text-slate-400">Live sends</dt>
              <dd className="font-semibold text-white">blocked by default</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs text-slate-400">Save a draft to run local consent and opt-out checks.</p>
        )}
      </section>

      <section className="grid gap-3.5 rounded-2xl border border-white/5 bg-slate-900/30 p-5">
        <label className="grid gap-2 text-xs font-semibold text-slate-300">
          Schedule time
          <input
            className="rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            onChange={(event) => setScheduledAt(event.target.value)}
            type="datetime-local"
            value={scheduledAt}
          />
        </label>
        <button
          className="rounded-xl bg-teal-600 hover:bg-teal-500 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={pending || !campaignId || !preflight?.allowed}
          onClick={scheduleCampaign}
          type="button"
        >
          Schedule Locally
        </button>
        <p className="text-xs text-slate-400 leading-5">Scheduling writes a local queue job only. Campaign sending remains gated.</p>
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
