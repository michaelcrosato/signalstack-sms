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
const requiredLiveWorkerControlRequirements = liveWorkerControls.map((control) => control.requirement);
const liveWorkerControlPublicFields = Object.freeze(["id", "status", "requirement"] as const);
const liveWorkerAuthorizationPublicFields = Object.freeze(["workerDeploymentClass", "controls"] as const);

export const productionLiveCampaignWorkerControls = Object.freeze(
  liveWorkerControls.map((control) => Object.freeze({ ...control }))
);

function safeArrayIsArray(value: unknown) {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function safeGetPrototypeOf(value: object) {
  try {
    return Object.getPrototypeOf(value);
  } catch {
    return null;
  }
}

function safeGetOwnPropertyDescriptor(value: object, property: PropertyKey) {
  try {
    return Object.getOwnPropertyDescriptor(value, property);
  } catch {
    return undefined;
  }
}

function safeOwnKeys(value: object) {
  try {
    return Reflect.ownKeys(value);
  } catch {
    return null;
  }
}

function safeHasOwnProperty(value: object, property: PropertyKey) {
  try {
    return Object.prototype.hasOwnProperty.call(value, property);
  } catch {
    return false;
  }
}

function safeIsFrozen(value: object) {
  try {
    return Object.isFrozen(value);
  } catch {
    return false;
  }
}

function arrayLengthFromDescriptor(controls: readonly LiveWorkerControl[]) {
  const descriptor = safeGetOwnPropertyDescriptor(controls, "length");
  if (descriptor === undefined || !("value" in descriptor)) {
    return null;
  }

  return descriptor.value === requiredLiveWorkerControlIds.length ? descriptor.value : null;
}

function isReadonlyControlArray(controls: unknown): controls is readonly LiveWorkerControl[] {
  return safeArrayIsArray(controls) && safeGetPrototypeOf(controls as object) === Array.prototype;
}

function isControlRecord(control: unknown): control is LiveWorkerControl {
  return control !== null && typeof control === "object" && safeGetPrototypeOf(control) === Object.prototype;
}

function controlDataFieldValue(control: unknown, field: keyof LiveWorkerControl) {
  if (!isControlRecord(control)) {
    return undefined;
  }

  const descriptor = safeGetOwnPropertyDescriptor(control, field);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function isLiveWorkerControlStatus(status: unknown): status is LiveWorkerControlStatus {
  return status === "planned" || status === "implemented";
}

function controlArrayIsDense(controls: readonly LiveWorkerControl[]) {
  const length = arrayLengthFromDescriptor(controls);
  if (length === null) {
    return false;
  }

  for (let index = 0; index < length; index += 1) {
    if (!safeHasOwnProperty(controls, index)) {
      return false;
    }
  }
  return true;
}

function liveWorkerControlArrayValues(controls: unknown) {
  if (!isReadonlyControlArray(controls) || !controlArrayIsDense(controls)) {
    return null;
  }

  const length = arrayLengthFromDescriptor(controls);
  if (length === null) {
    return null;
  }

  return Array.from({ length }, (_, index) => {
    const descriptor = safeGetOwnPropertyDescriptor(controls, String(index));
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : null;
  });
}

export function liveWorkerControlArrayExposesOnlyIndexedEntries(controls: unknown) {
  if (!isReadonlyControlArray(controls) || !controlArrayIsDense(controls)) {
    return false;
  }

  const length = arrayLengthFromDescriptor(controls);
  const ownKeys = safeOwnKeys(controls);
  if (length === null || ownKeys === null) {
    return false;
  }

  const expectedKeys = Array.from({ length: length + 1 }, (_, index) =>
    index === length ? "length" : String(index)
  );
  if (ownKeys.length !== expectedKeys.length || !expectedKeys.every((key, index) => ownKeys[index] === key)) {
    return false;
  }

  const lengthDescriptor = safeGetOwnPropertyDescriptor(controls, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) {
    return false;
  }

  for (let index = 0; index < length; index += 1) {
    const descriptor = safeGetOwnPropertyDescriptor(controls, String(index));
    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
      return false;
    }
  }

  return true;
}

export function liveWorkerControlIdsMatchRequiredChecklist(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  return (
    controlValues.length === requiredLiveWorkerControlIds.length &&
    controlValues.every(
      (control, index) =>
        isControlRecord(control) &&
        controlDataFieldValue(control, "id") === requiredLiveWorkerControlIds[index] &&
        controlDataFieldValue(control, "requirement") === requiredLiveWorkerControlRequirements[index]
    )
  );
}

export function liveWorkerControlsExposeOnlyPublicFields(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  return controlValues.every((control) => {
    if (!isControlRecord(control)) {
      return false;
    }

    const ownKeys = safeOwnKeys(control);
    if (ownKeys === null) {
      return false;
    }

    return (
      ownKeys.length === liveWorkerControlPublicFields.length &&
      liveWorkerControlPublicFields.every((field, index) => {
        const descriptor = safeGetOwnPropertyDescriptor(control, field);
        return (
          ownKeys[index] === field &&
          descriptor !== undefined &&
          "value" in descriptor &&
          descriptor.enumerable === true
        );
      })
    );
  });
}

export function liveWorkerControlsUseSupportedStatuses(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  return controlValues.every(
    (control) =>
      isControlRecord(control) &&
      isLiveWorkerControlStatus(controlDataFieldValue(control, "status"))
  );
}

export function liveWorkerControlsAreFrozen(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  const controlArray = controls as readonly LiveWorkerControl[];
  return safeIsFrozen(controlArray) && controlValues.every((control) => isControlRecord(control) && safeIsFrozen(control));
}

function descriptorIsFrozenDataField(
  descriptor: PropertyDescriptor | undefined,
  options: { enumerable: boolean }
) {
  return (
    descriptor !== undefined &&
    "value" in descriptor &&
    descriptor.enumerable === options.enumerable &&
    descriptor.writable === false &&
    descriptor.configurable === false
  );
}

export function liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  const controlArray = controls as readonly LiveWorkerControl[];
  if (!descriptorIsFrozenDataField(safeGetOwnPropertyDescriptor(controlArray, "length"), { enumerable: false })) {
    return false;
  }

  for (let index = 0; index < controlValues.length; index += 1) {
    if (!descriptorIsFrozenDataField(safeGetOwnPropertyDescriptor(controlArray, String(index)), { enumerable: true })) {
      return false;
    }
  }

  return controlValues.every((control) => {
    if (!isControlRecord(control)) {
      return false;
    }

    return liveWorkerControlPublicFields.every((field) =>
      descriptorIsFrozenDataField(safeGetOwnPropertyDescriptor(control, field), { enumerable: true })
    );
  });
}

export function liveWorkerControlsAreImplemented(controls: unknown = productionLiveCampaignWorkerControls) {
  if (!isReadonlyControlArray(controls)) {
    return false;
  }

  return (
    liveWorkerControlsAreFrozen(controls) &&
    liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls) &&
    liveWorkerControlArrayExposesOnlyIndexedEntries(controls) &&
    liveWorkerControlsExposeOnlyPublicFields(controls) &&
    liveWorkerControlsUseSupportedStatuses(controls) &&
    liveWorkerControlIdsMatchRequiredChecklist(controls) &&
    liveWorkerControlArrayValues(controls)?.every(
      (control) => controlDataFieldValue(control, "status") === "implemented"
    ) === true
  );
}

function authorizationInputDataFieldValue(input: unknown, field: "workerDeploymentClass" | "controls") {
  if (input === null || typeof input !== "object") {
    return undefined;
  }

  const descriptor = safeGetOwnPropertyDescriptor(input, field);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function authorizationInputExposesOnlyPublicFields(input: unknown) {
  if (input === null || typeof input !== "object" || safeGetPrototypeOf(input) !== Object.prototype) {
    return false;
  }

  if (!safeIsFrozen(input)) {
    return false;
  }

  const ownKeys = safeOwnKeys(input);
  if (ownKeys === null || ownKeys.length !== liveWorkerAuthorizationPublicFields.length) {
    return false;
  }

  return liveWorkerAuthorizationPublicFields.every((field, index) => {
    const descriptor = safeGetOwnPropertyDescriptor(input, field);
    return ownKeys[index] === field && descriptorIsFrozenDataField(descriptor, { enumerable: true });
  });
}

export function liveWorkerDeploymentClassIsAuthorized(input: {
  workerDeploymentClass?: unknown;
  controls?: unknown;
} = {}) {
  if (!authorizationInputExposesOnlyPublicFields(input)) {
    return false;
  }

  const workerDeploymentClass = authorizationInputDataFieldValue(input, "workerDeploymentClass");
  if (workerDeploymentClass !== reservedLiveWorkerDeploymentClass) {
    return false;
  }

  const controls = authorizationInputDataFieldValue(input, "controls");
  return liveWorkerControlsAreImplemented(controls);
}
