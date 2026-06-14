"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { productContactImportDefaults } from "@/lib/product/contact-import-defaults";

type ImportSummary = {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errors: Array<{ row: number; message: string }>;
};

export function ContactImportForm() {
  const router = useRouter();
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedFilename = String(formData.get("filename") ?? productContactImportDefaults.filename);
    const submittedCsv = String(formData.get("csv") ?? productContactImportDefaults.csv);
    setPending(true);
    setError(null);
    setSummary(null);

    const response = await fetch("/api/contacts/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: submittedFilename, csv: submittedCsv })
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Contact import failed.");
      setPending(false);
      return;
    }

    setSummary(payload.summary);
    setPending(false);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Filename
        <input
          className="rounded border border-slate-300 px-3 py-2 text-slate-950"
          defaultValue={productContactImportDefaults.filename}
          name="filename"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        CSV rows
        <textarea
          className="min-h-40 rounded border border-slate-300 px-3 py-2 font-mono text-sm text-slate-950"
          defaultValue={productContactImportDefaults.csv}
          name="csv"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={pending}
          type="submit"
        >
          {pending ? "Importing" : "Import Contacts"}
        </button>
        <p className="text-sm text-slate-600">Local import only. No SMS, provider calls, or billing actions run.</p>
      </div>
      {summary ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" role="status">
          Imported {summary.importedRows} of {summary.totalRows} rows. Failed rows: {summary.failedRows}.
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
