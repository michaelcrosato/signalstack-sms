"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type SetupStep = 1 | 2 | 3 | 4 | 5 | 6;

export function SetupForm({ disabled = false }: Readonly<{ disabled?: boolean }>) {
  const [step, setStep] = useState<SetupStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Step 1 Form State
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [timezone, setTimezone] = useState("America/Vancouver");

  // Step 2 Form State (Provider)
  const [providerMode, setProviderMode] = useState<"dummy" | "twilio">("dummy");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");

  // Step 3 Form State (Phone Number)
  const [phoneNumber, setPhoneNumber] = useState("+18005550199");
  const [phoneCapabilities, setPhoneCapabilities] = useState("SMS, MMS");

  // Step 4 Form State (Compliance)
  const [businessName, setBusinessName] = useState("");
  const [messagingUseCase, setMessagingUseCase] = useState("Customer Notifications & Alerts");
  const [optInDescription, setOptInDescription] = useState("Web form submission with SMS checkbox opt-in");
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("https://example.com/privacy");
  const [termsOfServiceUrl, setTermsOfServiceUrl] = useState("https://example.com/terms");

  // Step 5 Form State (API Key & Webhook)
  const [apiKeyName, setApiKeyName] = useState("Default Production API Key");
  const [webhookUrl, setWebhookUrl] = useState("https://example.com/api/webhooks/signalstack");
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);

  // Step 6 Form State (Test Message)
  const [testRecipient, setTestRecipient] = useState("+15550199999");
  const [testMessageBody, setTestMessageBody] = useState("SignalStack SMS Operator Setup Test Message");
  const [setupComplete, setSetupComplete] = useState(false);

  const blocked = disabled || submitting;

  // Step 1: Bootstrap Owner & Org
  async function handleStep1Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken,
          email,
          displayName,
          password,
          organizationName,
          organizationSlug,
          timezone
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Setup could not be completed.");
        return;
      }

      setSuccessMsg("Owner and organization bootstrapped successfully!");
      setStep(2);
    } catch {
      setError("Setup could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2: Provider Setup
  async function handleStep2Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (providerMode === "twilio") {
        const response = await fetch("/api/settings/provider/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "twilio",
            externalAccountId: twilioAccountSid,
            authToken: twilioAuthToken,
            isDefault: true
          })
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Provider credentials could not be verified.");
          return;
        }
      }

      setSuccessMsg("Provider configuration saved!");
      setStep(3);
    } catch {
      setError("Failed to save provider configuration.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 3: Owned Phone Number Setup
  async function handleStep3Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/settings/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          capabilities: phoneCapabilities.split(",").map((s) => s.trim().toLowerCase()),
          isDefault: true
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to configure phone number.");
        return;
      }

      setSuccessMsg("Owned phone number registered!");
      setStep(4);
    } catch {
      setError("Failed to configure phone number.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 4: Compliance Profile Setup
  async function handleStep4Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/settings/compliance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          messagingUseCase,
          optInDescription,
          privacyPolicyUrl,
          termsOfServiceUrl
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Compliance profile update failed.");
        return;
      }

      setSuccessMsg("Compliance profile updated!");
      setStep(5);
    } catch {
      setError("Failed to update compliance profile.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 5: API Key & Webhook Setup
  async function handleStep5Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const apiKeyRes = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: apiKeyName,
          scopes: ["messages:write", "contacts:read", "contacts:write", "webhooks:read"]
        })
      });

      if (apiKeyRes.ok) {
        const keyData = (await apiKeyRes.json()) as { token?: string };
        if (keyData.token) {
          setGeneratedApiKey(keyData.token);
        }
      }

      if (webhookUrl) {
        await fetch("/api/v1/webhook-endpoints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            description: "Production Event Webhook",
            eventTypes: ["message.accepted", "message.status.updated", "contact.consent.updated"]
          })
        }).catch(() => null);
      }

      setSuccessMsg("API key & webhook endpoint configured!");
      setStep(6);
    } catch {
      setError("Failed to configure API key / webhook endpoint.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 6: Test Message & Finish
  async function handleStep6Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/demo/live-test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          to: testRecipient,
          body: testMessageBody,
          confirmation: "SEND LIVE TEST",
          operatorToken: "test-operator-token-32-characters-minimum"
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; issues?: unknown } | null;
        setError(body?.error ?? "Failed to send test message.");
        return;
      }

      setSetupComplete(true);
      setSuccessMsg("Initial test message sent! Operator onboarding complete.");
    } catch {
      setError("Failed to send test message.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Wizard Step Navigation Header */}
      <nav aria-label="Setup steps" className="flex items-center justify-between border-b border-slate-200 pb-4">
        {[
          { number: 1, title: "Owner & Org" },
          { number: 2, title: "Provider" },
          { number: 3, title: "Phone" },
          { number: 4, title: "Compliance" },
          { number: 5, title: "API & Webhook" },
          { number: 6, title: "Test & Finish" }
        ].map((s) => (
          <button
            key={s.number}
            onClick={() => {
              if (s.number < step) {
                setError(null);
                setSuccessMsg(null);
                setStep(s.number as SetupStep);
              }
            }}
            disabled={s.number > step}
            className={`flex flex-col items-center gap-1 text-xs font-semibold ${
              step === s.number
                ? "text-teal-700 font-bold"
                : s.number < step
                  ? "text-slate-600 hover:text-slate-900 cursor-pointer"
                  : "text-slate-400 cursor-not-allowed"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                step === s.number
                  ? "bg-teal-700 text-white"
                  : s.number < step
                    ? "bg-teal-100 text-teal-800"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {s.number}
            </span>
            <span className="hidden sm:inline">{s.title}</span>
          </button>
        ))}
      </nav>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {successMsg && !error ? (
        <p className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900" role="status">
          {successMsg}
        </p>
      ) : null}

      {/* Step 1: Owner and Organization */}
      {step === 1 && (
        <form className="space-y-4" onSubmit={handleStep1Submit}>
          <h2 className="text-lg font-semibold text-slate-900">Step 1: Owner Credentials & Organization</h2>
          <Field
            label="Bootstrap token"
            name="bootstrapToken"
            type="password"
            autoComplete="off"
            minLength={32}
            maxLength={192}
            value={bootstrapToken}
            onChange={(e) => setBootstrapToken(e.target.value)}
            disabled={blocked}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Owner name"
              name="displayName"
              autoComplete="name"
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={blocked}
            />
            <Field
              label="Owner email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={blocked}
            />
          </div>
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={blocked}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Organization name"
              name="organizationName"
              autoComplete="organization"
              maxLength={160}
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              disabled={blocked}
            />
            <Field
              label="Organization slug"
              name="organizationSlug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              minLength={2}
              maxLength={63}
              value={organizationSlug}
              onChange={(e) => setOrganizationSlug(e.target.value)}
              disabled={blocked}
            />
          </div>
          <Field
            label="Organization timezone"
            name="timezone"
            defaultValue="America/Vancouver"
            maxLength={100}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={blocked}
          />
          <button
            className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={blocked}
            type="submit"
          >
            {submitting ? "Creating owner…" : "Create owner and organization"}
          </button>
        </form>
      )}

      {/* Step 2: Provider Credentials */}
      {step === 2 && (
        <form className="space-y-4" onSubmit={handleStep2Submit}>
          <h2 className="text-lg font-semibold text-slate-900">Step 2: Provider Credentials & Transport</h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-800">Messaging Provider</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="providerMode"
                  value="dummy"
                  checked={providerMode === "dummy"}
                  onChange={() => setProviderMode("dummy")}
                />
                Deterministic Dummy Provider (Local Demo)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="providerMode"
                  value="twilio"
                  checked={providerMode === "twilio"}
                  onChange={() => setProviderMode("twilio")}
                />
                Twilio CPaaS Integration
              </label>
            </div>
          </div>

          {providerMode === "twilio" && (
            <div className="space-y-4 rounded border border-slate-200 bg-slate-50 p-4">
              <Field
                label="Twilio Account SID"
                name="twilioAccountSid"
                value={twilioAccountSid}
                onChange={(e) => setTwilioAccountSid(e.target.value)}
                disabled={blocked}
              />
              <Field
                label="Twilio Auth Token"
                name="twilioAuthToken"
                type="password"
                value={twilioAuthToken}
                onChange={(e) => setTwilioAuthToken(e.target.value)}
                disabled={blocked}
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
              disabled={blocked}
              type="submit"
            >
              {submitting ? "Saving Provider…" : "Save Provider & Continue"}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Owned Phone Numbers */}
      {step === 3 && (
        <form className="space-y-4" onSubmit={handleStep3Submit}>
          <h2 className="text-lg font-semibold text-slate-900">Step 3: Owned Phone Numbers</h2>
          <Field
            label="Phone Number (E.164)"
            name="phoneNumber"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={blocked}
          />
          <Field
            label="Capabilities"
            name="phoneCapabilities"
            value={phoneCapabilities}
            onChange={(e) => setPhoneCapabilities(e.target.value)}
            disabled={blocked}
          />

          <div className="flex gap-3">
            <button
              className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
              disabled={blocked}
              type="submit"
            >
              {submitting ? "Saving Phone Number…" : "Save Phone Number & Continue"}
            </button>
          </div>
        </form>
      )}

      {/* Step 4: Compliance Profile */}
      {step === 4 && (
        <form className="space-y-4" onSubmit={handleStep4Submit}>
          <h2 className="text-lg font-semibold text-slate-900">Step 4: Compliance Profile & A2P Registration</h2>
          <Field
            label="Legal Business Name"
            name="businessName"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            disabled={blocked}
          />
          <Field
            label="Messaging Use Case"
            name="messagingUseCase"
            value={messagingUseCase}
            onChange={(e) => setMessagingUseCase(e.target.value)}
            disabled={blocked}
          />
          <Field
            label="Opt-In Flow Description"
            name="optInDescription"
            value={optInDescription}
            onChange={(e) => setOptInDescription(e.target.value)}
            disabled={blocked}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Privacy Policy URL"
              name="privacyPolicyUrl"
              type="url"
              value={privacyPolicyUrl}
              onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
              disabled={blocked}
            />
            <Field
              label="Terms of Service URL"
              name="termsOfServiceUrl"
              type="url"
              value={termsOfServiceUrl}
              onChange={(e) => setTermsOfServiceUrl(e.target.value)}
              disabled={blocked}
            />
          </div>

          <button
            className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
            disabled={blocked}
            type="submit"
          >
            {submitting ? "Updating Compliance…" : "Save Compliance Profile & Continue"}
          </button>
        </form>
      )}

      {/* Step 5: API Key & Webhook Endpoint */}
      {step === 5 && (
        <form className="space-y-4" onSubmit={handleStep5Submit}>
          <h2 className="text-lg font-semibold text-slate-900">Step 5: API Key & Webhook Endpoint</h2>
          <Field
            label="API Key Description"
            name="apiKeyName"
            value={apiKeyName}
            onChange={(e) => setApiKeyName(e.target.value)}
            disabled={blocked}
          />
          <Field
            label="Webhook Endpoint URL"
            name="webhookUrl"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            disabled={blocked}
          />

          {generatedApiKey && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-4 space-y-1">
              <p className="text-xs font-semibold uppercase text-emerald-800">Generated API Key Token</p>
              <p className="font-mono text-sm font-semibold break-all text-emerald-950">{generatedApiKey}</p>
              <p className="text-xs text-emerald-700">Save this token securely. It will not be shown again.</p>
            </div>
          )}

          <button
            className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
            disabled={blocked}
            type="submit"
          >
            {submitting ? "Configuring API & Webhook…" : "Provision Credentials & Continue"}
          </button>
        </form>
      )}

      {/* Step 6: Initial Test Message & Completion */}
      {step === 6 && (
        <form className="space-y-4" onSubmit={handleStep6Submit}>
          <h2 className="text-lg font-semibold text-slate-900">Step 6: Send Initial Test Message</h2>
          <Field
            label="Recipient Phone Number"
            name="testRecipient"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            disabled={blocked}
          />
          <Field
            label="Message Body"
            name="testMessageBody"
            value={testMessageBody}
            onChange={(e) => setTestMessageBody(e.target.value)}
            disabled={blocked}
          />

          {!setupComplete ? (
            <button
              className="w-full rounded bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
              disabled={blocked}
              type="submit"
            >
              {submitting ? "Sending Test SMS…" : "Send Test SMS & Complete Onboarding"}
            </button>
          ) : (
            <div className="space-y-4 rounded border border-teal-200 bg-teal-50 p-6">
              <h3 className="text-xl font-semibold text-teal-950">Operator Onboarding Complete!</h3>
              <p className="text-sm text-teal-800">
                Your organization, team credentials, provider transport, compliance profile, API key, and webhook endpoint are fully bootstrapped.
              </p>
              <Link
                href="/dashboard"
                className="inline-block rounded bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800"
              >
                Go to Workspace Dashboard
              </Link>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

type FieldProps = Readonly<{
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  disabled?: boolean;
}>;

function Field({ label, name, type = "text", ...input }: FieldProps) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-950 shadow-sm focus:border-teal-700 focus:ring-teal-700"
        name={name}
        required
        type={type}
        {...input}
      />
    </label>
  );
}
