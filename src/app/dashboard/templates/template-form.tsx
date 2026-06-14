"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { productTemplateFormDefaults } from "@/lib/product/template-form-defaults";

export function TemplateForm() {
  const router = useRouter();
  const [name, setName] = useState<string>(productTemplateFormDefaults.name);
  const [body, setBody] = useState<string>(productTemplateFormDefaults.body);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const variables = useMemo(() => extractVariables(body), [body]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body })
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Template could not be saved.");
      setPending(false);
      return;
    }

    setStatus("Template saved locally. Campaign sending remains gated.");
    setPending(false);
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <label className="grid gap-2 text-xs font-semibold text-slate-300">
        Template name
        <input
          className="rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </label>
      <label className="grid gap-2 text-xs font-semibold text-slate-300">
        Message body
        <textarea
          className="min-h-40 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          onChange={(event) => setBody(event.target.value)}
          value={body}
        />
      </label>
      <section aria-label="Detected variables" className="rounded-2xl border border-white/5 bg-slate-900/30 p-4 text-xs">
        <h3 className="font-bold text-white">Detected variables</h3>
        <p className="mt-2 text-slate-300 font-mono text-[11px]">{variables.length > 0 ? variables.join(", ") : "none"}</p>
      </section>
      <div className="flex flex-wrap items-center gap-4 border-t border-white/5 pt-4">
        <button
          className="rounded-xl bg-teal-600 hover:bg-teal-500 px-5 py-2.5 text-xs font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving" : "Save Template"}
        </button>
        <p className="text-xs text-slate-400">Local template only. No provider calls, SMS, live AI, or billing actions run.</p>
      </div>
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
    </form>
  );
}

function extractVariables(body: string) {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]))].sort();
}
