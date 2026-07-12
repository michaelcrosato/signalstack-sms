"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

type Account = Readonly<{
  id: string;
  externalAccountIdLast4: string;
  status: string;
  isDefault: boolean;
  activeCredentialVersion: number | null;
}>;

type PhoneNumber = Readonly<{
  id: string;
  providerAccountId: string | null;
  phoneNumber: string;
  status: string;
  isDefault: boolean;
}>;

type MessagingService = Readonly<{
  id: string;
  providerAccountId: string;
  externalServiceIdLast4: string;
  status: string;
  isDefault: boolean;
}>;

type Discovery = Readonly<{
  credentialVersion: number;
  phoneNumbers: readonly Readonly<{
    candidateId: string;
    externalNumberIdLast4: string;
    phoneNumber: string;
    capabilities: readonly string[];
  }>[];
  messagingServices: readonly Readonly<{
    candidateId: string;
    externalServiceIdLast4: string;
  }>[];
}>;

type Notice = Readonly<{ kind: "idle" | "success" | "error"; message: string }>;

export function ProviderAccountControls({
  accounts,
  phoneNumbers,
  messagingServices
}: {
  accounts: readonly Account[];
  phoneNumbers: readonly PhoneNumber[];
  messagingServices: readonly MessagingService[];
}) {
  if (accounts.length === 0) return null;
  return (
    <section className="grid gap-5">
      {accounts.map((account) => (
        <ProviderAccountControl
          key={account.id}
          account={account}
          phoneNumbers={phoneNumbers.filter((number) => number.providerAccountId === account.id)}
          messagingServices={messagingServices.filter(
            (service) => service.providerAccountId === account.id
          )}
        />
      ))}
    </section>
  );
}

function ProviderAccountControl({
  account,
  phoneNumbers,
  messagingServices
}: {
  account: Account;
  phoneNumbers: readonly PhoneNumber[];
  messagingServices: readonly MessagingService[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>({ kind: "idle", message: "" });
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [defaultNumber, setDefaultNumber] = useState(false);
  const [defaultService, setDefaultService] = useState(false);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const base = `/api/settings/provider/accounts/${encodeURIComponent(account.id)}`;

  async function runAction(path: string, success: string) {
    setNotice({ kind: "idle", message: "" });
    const response = await fetch(`${base}/${path}`, { method: "POST" });
    if (!response.ok) {
      setNotice({ kind: "error", message: await safeError(response) });
      return;
    }
    setNotice({ kind: "success", message: success });
    startTransition(() => router.refresh());
  }

  async function makeAccountDefault() {
    try {
      const response = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true })
      });
      if (!response.ok) {
        setNotice({ kind: "error", message: await safeError(response) });
        return;
      }
      setNotice({ kind: "success", message: "Default provider account updated." });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ kind: "error", message: "Provider operation failed." });
    }
  }

  async function discover() {
    setNotice({ kind: "idle", message: "" });
    const response = await fetch(`${base}/discover`, { method: "POST" });
    if (!response.ok) {
      setNotice({ kind: "error", message: await safeError(response) });
      return;
    }
    const body = (await response.json()) as { discovery?: Discovery };
    if (!body.discovery) {
      setNotice({ kind: "error", message: "Provider discovery returned no usable inventory." });
      return;
    }
    setDiscovery(body.discovery);
    setSelectedNumbers([]);
    setSelectedServices([]);
    setNotice({ kind: "success", message: "Fresh provider inventory loaded." });
  }

  async function importSelected() {
    if (!discovery || selectedNumbers.length + selectedServices.length === 0) {
      setNotice({ kind: "error", message: "Select at least one discovered resource." });
      return;
    }
    const response = await fetch(`${base}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentialVersion: discovery.credentialVersion,
        phoneNumberCandidateIds: selectedNumbers,
        messagingServiceCandidateIds: selectedServices,
        ...(defaultNumber && selectedNumbers[0]
          ? { defaultPhoneNumberCandidateId: selectedNumbers[0] }
          : {}),
        ...(defaultService && selectedServices[0]
          ? { defaultMessagingServiceCandidateId: selectedServices[0] }
          : {})
      })
    });
    if (!response.ok) {
      setNotice({ kind: "error", message: await safeError(response) });
      return;
    }
    setDiscovery(null);
    setSelectedNumbers([]);
    setSelectedServices([]);
    setNotice({ kind: "success", message: "Verified provider resources imported." });
    startTransition(() => router.refresh());
  }

  async function updateResource(
    url: string,
    action: "makeDefault" | "disable",
    success: string
  ) {
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [action]: true })
      });
      if (!response.ok) {
        setNotice({ kind: "error", message: await safeError(response) });
        return;
      }
      setNotice({ kind: "success", message: success });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ kind: "error", message: "Provider operation failed." });
    }
  }

  async function rotate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch(`${base}/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: String(formData.get("authToken") ?? "") })
      });
      if (!response.ok) {
        setNotice({ kind: "error", message: await safeError(response) });
        return;
      }
      setNotice({ kind: "success", message: "Replacement credential verified and activated." });
      startTransition(() => router.refresh());
    } catch {
      setNotice({ kind: "error", message: "Provider operation failed." });
    } finally {
      form.reset();
    }
  }

  async function revoke() {
    if (!revokeConfirmed) return;
    const response = await fetch(base, { method: "DELETE" });
    if (!response.ok) {
      setNotice({ kind: "error", message: await safeError(response) });
      return;
    }
    setNotice({ kind: "success", message: "Provider account revoked locally." });
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Twilio account ending {account.externalAccountIdLast4}
          </h2>
          <p className="text-sm text-slate-600">
            {account.status} · active credential v{account.activeCredentialVersion ?? "none"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {account.status === "VERIFIED" && !account.isDefault ? (
            <ActionButton disabled={isPending} onClick={makeAccountDefault}>Make account default</ActionButton>
          ) : null}
          <ActionButton disabled={isPending} onClick={() => runAction("verify", "Account reverified.")}>Verify</ActionButton>
          <ActionButton disabled={isPending} onClick={() => runAction("health", "Health check recorded.")}>Health</ActionButton>
          <ActionButton disabled={isPending} onClick={discover}>Discover resources</ActionButton>
        </div>
      </div>

      {discovery ? (
        <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <CandidateList
            title="Phone numbers"
            rows={discovery.phoneNumbers.map((number) => ({
              id: number.candidateId,
              label: `${number.phoneNumber} · ${number.capabilities.join(", ")} · ID …${number.externalNumberIdLast4}`
            }))}
            selected={selectedNumbers}
            onChange={setSelectedNumbers}
          />
          <CandidateList
            title="Messaging services"
            rows={discovery.messagingServices.map((service) => ({
              id: service.candidateId,
              label: `Service ID ending ${service.externalServiceIdLast4}`
            }))}
            selected={selectedServices}
            onChange={setSelectedServices}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={defaultNumber} onChange={(event) => setDefaultNumber(event.currentTarget.checked)} />
            Make the first selected number the organization default
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={defaultService} onChange={(event) => setDefaultService(event.currentTarget.checked)} />
            Make the first selected service the account default
          </label>
          <button className="w-fit rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={importSelected}>
            Import selected resources
          </button>
        </div>
      ) : null}

      {phoneNumbers.length + messagingServices.length > 0 ? (
        <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <OwnedResourceList
            title="Owned phone numbers"
            rows={phoneNumbers.map((number) => ({
              id: number.id,
              label: `${number.phoneNumber} · ${number.status}${number.isDefault ? " · default" : ""}`,
              canDefault: number.status === "VERIFIED" && !number.isDefault,
              canDisable: number.status === "VERIFIED",
              onDefault: () =>
                updateResource(
                  `/api/settings/numbers/${encodeURIComponent(number.id)}`,
                  "makeDefault",
                  "Default sender updated."
                ),
              onDisable: () =>
                updateResource(
                  `/api/settings/numbers/${encodeURIComponent(number.id)}`,
                  "disable",
                  "Sender disabled locally."
                )
            }))}
          />
          <OwnedResourceList
            title="Messaging services"
            rows={messagingServices.map((service) => ({
              id: service.id,
              label: `ID ending ${service.externalServiceIdLast4} · ${service.status}${service.isDefault ? " · default" : ""}`,
              canDefault: service.status === "VERIFIED" && !service.isDefault,
              canDisable: service.status === "VERIFIED",
              onDefault: () =>
                updateResource(
                  `${base}/messaging-services/${encodeURIComponent(service.id)}`,
                  "makeDefault",
                  "Default messaging service updated."
                ),
              onDisable: () =>
                updateResource(
                  `${base}/messaging-services/${encodeURIComponent(service.id)}`,
                  "disable",
                  "Messaging service disabled locally."
                )
            }))}
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
        <form className="grid gap-3" onSubmit={rotate}>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Replacement auth token
            <input className="rounded border border-slate-300 px-3 py-2" name="authToken" type="password" autoComplete="off" required minLength={32} maxLength={32} pattern="[A-Fa-f0-9]{32}" />
          </label>
          <button className="w-fit rounded border border-slate-900 px-4 py-2 text-sm font-semibold" type="submit">Verify and rotate</button>
        </form>
        <div className="grid content-start gap-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input className="mt-1" type="checkbox" checked={revokeConfirmed} onChange={(event) => setRevokeConfirmed(event.currentTarget.checked)} />
            Revoke this account and disable its imported resources locally
          </label>
          <button className="w-fit rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50" type="button" disabled={!revokeConfirmed} onClick={revoke}>Revoke account</button>
        </div>
      </div>
      {notice.message ? <p className={notice.kind === "error" ? "mt-4 text-sm font-medium text-red-700" : "mt-4 text-sm font-medium text-teal-700"}>{notice.message}</p> : null}
    </section>
  );
}

function OwnedResourceList({
  title,
  rows
}: {
  title: string;
  rows: readonly Readonly<{
    id: string;
    label: string;
    canDefault: boolean;
    canDisable: boolean;
    onDefault: () => void;
    onDisable: () => void;
  }>[];
}) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      {rows.map((row) => (
        <div key={row.id} className="grid gap-2 rounded border border-slate-200 p-3 text-sm">
          <p className="text-slate-700">{row.label}</p>
          <div className="flex flex-wrap gap-2">
            {row.canDefault ? (
              <ActionButton disabled={false} onClick={row.onDefault}>Make default</ActionButton>
            ) : null}
            {row.canDisable ? (
              <ActionButton disabled={false} onClick={row.onDisable}>Disable locally</ActionButton>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function CandidateList({ title, rows, selected, onChange }: { title: string; rows: readonly Readonly<{ id: string; label: string }>[]; selected: readonly string[]; onChange: (next: string[]) => void }) {
  return (
    <fieldset className="grid content-start gap-2">
      <legend className="text-sm font-semibold text-slate-950">{title}</legend>
      {rows.length === 0 ? <p className="text-sm text-slate-600">None discovered.</p> : rows.map((row) => (
        <label key={row.id} className="flex items-start gap-2 text-sm text-slate-700">
          <input className="mt-1" type="checkbox" checked={selected.includes(row.id)} onChange={(event) => onChange(event.currentTarget.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} />
          {row.label}
        </label>
      ))}
    </fieldset>
  );
}

function ActionButton({ children, disabled, onClick }: { children: string; disabled: boolean; onClick: () => void }) {
  return <button className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50" type="button" disabled={disabled} onClick={onClick}>{children}</button>;
}

async function safeError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : "Provider operation failed.";
  } catch {
    return "Provider operation failed.";
  }
}
