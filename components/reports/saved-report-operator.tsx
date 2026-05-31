"use client";

import { useState } from "react";

export function SavedReportOperator() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: "save" | "export") => {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/analytics/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }

      const contentType = res.headers.get("Content-Type");
      if (contentType && contentType.includes("text/csv")) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;

        const contentDisposition = res.headers.get("Content-Disposition");
        let filename = `export-${Date.now()}.csv`;
        if (contentDisposition && contentDisposition.includes("filename=")) {
          filename = contentDisposition.split("filename=")[1].replace(/"/g, "");
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setMessage("Report exported successfully.");
      } else {
        const data = await res.json();
        setMessage(data.message || `Successfully executed ${action}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto mt-6 flex w-full max-w-7xl items-center justify-between rounded border border-slate-200 bg-white p-4 shadow-sm px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Reporting Controls</h2>
        <p className="text-sm text-slate-600">Save snapshots or export CSV representations of current analytics.</p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-3">
          <button
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => handleAction("export")}
            type="button"
          >
            Export CSV
          </button>
          <button
            className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            disabled={loading}
            onClick={() => handleAction("save")}
            type="button"
          >
            {loading ? "Processing..." : "Save Report"}
          </button>
        </div>
        {message && <p className="text-xs text-green-700">{message}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}
