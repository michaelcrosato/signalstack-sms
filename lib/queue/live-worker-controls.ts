export const reservedLiveWorkerDeploymentClass = "production-live-campaign" as const;

export const supportedLiveWorkerControlStatuses = Object.freeze(["planned", "implemented"] as const);

export type LiveWorkerControlStatus = (typeof supportedLiveWorkerControlStatuses)[number];

export type LiveWorkerControl = Readonly<{
  id: string;
  status: LiveWorkerControlStatus;
  requirement: string;
}>;

const liveWorkerControls = [
  {
    id: "deploy-environment-allowlist",
    status: "planned",
    requirement: "Deploy-time allowlist names exact production worker environments and rejects every other production-like environment."
  },
  {
    id: "org-live-campaign-flag",
    status: "planned",
    requirement: "Org-level live campaign sending flag is separate from live messaging and live-test SMS flags."
  },
  {
    id: "provider-mutation-hard-gate",
    status: "planned",
    requirement: "Provider mutation boundary calls the centralized messaging hard gate immediately before outbound provider requests."
  },
  {
    id: "per-recipient-send-time-checks",
    status: "planned",
    requirement: "Every recipient is rechecked for consent, archive state, opt-out state, compliance, quiet hours, and tenant ownership."
  },
  {
    id: "tenant-idempotency-contract",
    status: "planned",
    requirement: "Queue jobs, outbound messages, provider request keys, and webhook correlation remain tenant-scoped and idempotent."
  },
  {
    id: "worker-rate-limit-emergency-stop",
    status: "planned",
    requirement: "Worker concurrency, retries, dead letters, duplicate-send prevention, and emergency stop behavior are bounded."
  },
  {
    id: "secret-manager-only-credentials",
    status: "planned",
    requirement: "Provider credentials come from a secret manager and are redacted from logs, APIs, exports, and rendered pages."
  },
  {
    id: "redacted-observability",
    status: "planned",
    requirement: "Observability records provider status, queue state, and gate decisions without raw secrets or unintended message bodies."
  },
  {
    id: "billing-isolation",
    status: "planned",
    requirement: "Live worker usage recording cannot create Stripe artifacts unless the separate live billing gate is complete."
  },
  {
    id: "rollback-runbook",
    status: "planned",
    requirement: "Rollback disables live campaign workers without code changes and proves queued work stops before provider calls."
  },
  {
    id: "blocked-state-coverage",
    status: "planned",
    requirement: "Tests prove every current blocked state remains blocked until all future live-worker controls are implemented."
  }
] as const satisfies readonly LiveWorkerControl[];

const requiredLiveWorkerControlIds = liveWorkerControls.map((control) => control.id);

export const productionLiveCampaignWorkerControls = Object.freeze(
  liveWorkerControls.map((control) => Object.freeze({ ...control }))
);

export function liveWorkerControlIdsMatchRequiredChecklist(controls: readonly LiveWorkerControl[]) {
  return (
    controls.length === requiredLiveWorkerControlIds.length &&
    controls.every((control, index) => control.id === requiredLiveWorkerControlIds[index])
  );
}

export function liveWorkerControlsAreImplemented(controls: readonly LiveWorkerControl[] = productionLiveCampaignWorkerControls) {
  return (
    liveWorkerControlIdsMatchRequiredChecklist(controls) &&
    controls.every((control) => control.status === "implemented")
  );
}

export function liveWorkerDeploymentClassIsAuthorized(input: {
  workerDeploymentClass?: string;
  controls?: readonly LiveWorkerControl[];
}) {
  return (
    input.workerDeploymentClass === reservedLiveWorkerDeploymentClass &&
    liveWorkerControlsAreImplemented(input.controls ?? productionLiveCampaignWorkerControls)
  );
}
