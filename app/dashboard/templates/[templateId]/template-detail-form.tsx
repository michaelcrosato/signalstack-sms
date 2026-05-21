"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type TemplateDetail = {
  id: string;
  name: string;
  body: string;
};

export function TemplateDetailForm({ template }: { template: TemplateDetail }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const variables = useMemo(() => extractVariables(body), [body]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    setError(null);

    const response = await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body })
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Template could not be updated.");
      setPending(false);
      return;
    }

    setStatus("Template updated locally. Campaign sending remains gated.");
    setPending(false);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Template name
        <input
          className="rounded border border-slate-300 px-3 py-2 text-slate-950 disabled:bg-slate-100"
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Message body
        <textarea
          className="min-h-44 rounded border border-slate-300 px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
          disabled={pending}
          onChange={(event) => setBody(event.target.value)}
          value={body}
        />
      </label>
      <section aria-label="Detected variables" className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
        <h3 className="font-semibold text-slate-950">Detected variables</h3>
        <p className="mt-2 text-slate-700">{variables.length > 0 ? variables.join(", ") : "none"}</p>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving" : "Save Template"}
        </button>
        <p className="text-sm text-slate-600">Local template edit only. No provider calls, SMS, live AI, or billing actions run.</p>
      </div>
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
    </form>
  );
}

function extractVariables(body: string) {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]))].sort();
}
