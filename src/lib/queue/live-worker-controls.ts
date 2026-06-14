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
  return safeGetOwnPropertyDescriptor(value, property) !== undefined;
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

function propertyKeysMatchExactly(actual: readonly PropertyKey[], expected: readonly PropertyKey[]) {
  if (actual.length !== expected.length) {
    return false;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return false;
    }
  }

  return true;
}

function defineScratchArrayValue<T>(values: T[], index: number, value: T) {
  Object.defineProperty(values, String(index), {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
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

  const values: Array<LiveWorkerControl | null> = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = safeGetOwnPropertyDescriptor(controls, String(index));
    defineScratchArrayValue(values, index, descriptor !== undefined && "value" in descriptor ? descriptor.value : null);
  }
  return values;
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

  const expectedKeys: string[] = [];
  for (let index = 0; index < length; index += 1) {
    defineScratchArrayValue(expectedKeys, index, String(index));
  }
  defineScratchArrayValue(expectedKeys, length, "length");
  if (!propertyKeysMatchExactly(ownKeys, expectedKeys)) {
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

  if (controlValues.length !== requiredLiveWorkerControlIds.length) {
    return false;
  }

  for (let index = 0; index < controlValues.length; index += 1) {
    const control = controlValues[index];
    if (
      !isControlRecord(control) ||
      controlDataFieldValue(control, "id") !== requiredLiveWorkerControlIds[index] ||
      controlDataFieldValue(control, "requirement") !== requiredLiveWorkerControlRequirements[index]
    ) {
      return false;
    }
  }

  return true;
}

export function liveWorkerControlsExposeOnlyPublicFields(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  for (let controlIndex = 0; controlIndex < controlValues.length; controlIndex += 1) {
    const control = controlValues[controlIndex];
    if (!isControlRecord(control)) {
      return false;
    }

    const ownKeys = safeOwnKeys(control);
    if (ownKeys === null) {
      return false;
    }

    if (!propertyKeysMatchExactly(ownKeys, liveWorkerControlPublicFields)) {
      return false;
    }

    for (let fieldIndex = 0; fieldIndex < liveWorkerControlPublicFields.length; fieldIndex += 1) {
      const field = liveWorkerControlPublicFields[fieldIndex];
      const descriptor = safeGetOwnPropertyDescriptor(control, field);
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        return false;
      }
    }
  }

  return true;
}

export function liveWorkerControlsUseSupportedStatuses(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  for (let controlIndex = 0; controlIndex < controlValues.length; controlIndex += 1) {
    const control = controlValues[controlIndex];
    if (!isControlRecord(control) || !isLiveWorkerControlStatus(controlDataFieldValue(control, "status"))) {
      return false;
    }
  }

  return true;
}

export function liveWorkerControlsAreFrozen(controls: unknown) {
  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  const controlArray = controls as readonly LiveWorkerControl[];
  if (!safeIsFrozen(controlArray)) {
    return false;
  }

  for (let controlIndex = 0; controlIndex < controlValues.length; controlIndex += 1) {
    const control = controlValues[controlIndex];
    if (!isControlRecord(control) || !safeIsFrozen(control)) {
      return false;
    }
  }

  return true;
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

  for (let controlIndex = 0; controlIndex < controlValues.length; controlIndex += 1) {
    const control = controlValues[controlIndex];
    if (!isControlRecord(control)) {
      return false;
    }

    for (let fieldIndex = 0; fieldIndex < liveWorkerControlPublicFields.length; fieldIndex += 1) {
      const field = liveWorkerControlPublicFields[fieldIndex];
      if (!descriptorIsFrozenDataField(safeGetOwnPropertyDescriptor(control, field), { enumerable: true })) {
        return false;
      }
    }
  }

  return true;
}

export function liveWorkerControlsAreImplemented(controls: unknown = productionLiveCampaignWorkerControls) {
  if (!isReadonlyControlArray(controls)) {
    return false;
  }

  if (
    !liveWorkerControlsAreFrozen(controls) ||
    !liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls) ||
    !liveWorkerControlArrayExposesOnlyIndexedEntries(controls) ||
    !liveWorkerControlsExposeOnlyPublicFields(controls) ||
    !liveWorkerControlsUseSupportedStatuses(controls) ||
    !liveWorkerControlIdsMatchRequiredChecklist(controls)
  ) {
    return false;
  }

  const controlValues = liveWorkerControlArrayValues(controls);
  if (controlValues === null) {
    return false;
  }

  for (let controlIndex = 0; controlIndex < controlValues.length; controlIndex += 1) {
    const control = controlValues[controlIndex];
    if (controlDataFieldValue(control, "status") !== "implemented") {
      return false;
    }
  }

  return true;
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

  if (!propertyKeysMatchExactly(ownKeys, liveWorkerAuthorizationPublicFields)) {
    return false;
  }

  for (let fieldIndex = 0; fieldIndex < liveWorkerAuthorizationPublicFields.length; fieldIndex += 1) {
    const field = liveWorkerAuthorizationPublicFields[fieldIndex];
    const descriptor = safeGetOwnPropertyDescriptor(input, field);
    if (!descriptorIsFrozenDataField(descriptor, { enumerable: true })) {
      return false;
    }
  }

  return true;
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
