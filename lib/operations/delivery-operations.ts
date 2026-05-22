export const allowedDeliveryOperationStatusLabels = Object.freeze([
  "local only",
  "provider reported",
  "blocked"
] as const);
export const allowedDeliveryOperationCommandExecutionStates = Object.freeze(["none"] as const);
export const allowedDeliveryOperationExternalImpactStates = Object.freeze(["none"] as const);
export const allowedDeliveryOperationMutationStates = Object.freeze(["none"] as const);
export const allowedDeliveryOperationSecretsDisplayedStates = Object.freeze([false] as const);

export type DeliveryOperationStatusLabel = (typeof allowedDeliveryOperationStatusLabels)[number];
export type DeliveryOperationCommandExecutionState = (typeof allowedDeliveryOperationCommandExecutionStates)[number];
export type DeliveryOperationExternalImpactState = (typeof allowedDeliveryOperationExternalImpactStates)[number];
export type DeliveryOperationMutationState = (typeof allowedDeliveryOperationMutationStates)[number];
export type DeliveryOperationSecretsDisplayedState = (typeof allowedDeliveryOperationSecretsDisplayedStates)[number];

export type DeliveryOperationCheckpoint = {
  name: string;
  status: DeliveryOperationStatusLabel;
  boundary: string;
};

export type DeliveryOperationsStatus = {
  checkpointCount: number;
  safetyBoundaryCount: number;
  commandExecution: DeliveryOperationCommandExecutionState;
  externalImpact: DeliveryOperationExternalImpactState;
  mutation: DeliveryOperationMutationState;
  secretsDisplayed: DeliveryOperationSecretsDisplayedState;
  checkpoints: readonly DeliveryOperationCheckpoint[];
  safetyBoundaries: readonly string[];
};

const deliveryOperationCheckpointFields = ["name", "status", "boundary"] as const;
const requiredDeliveryBoundaryTerms = [
  "SMS",
  "retry",
  "webhook",
  "provider calls",
  "billing",
  "notifications",
  "mutations",
  "secrets"
] as const;
const forbiddenCommandMetadataPatterns = [
  /\bnpm\s+run\b/i,
  /\bnpx\b/i,
  /\bpowershell\b/i,
  /\bcurl\b/i,
  /\bInvoke-WebRequest\b/i
] as const;
const forbiddenSecretMetadataPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bpk_live_[A-Za-z0-9]+/,
  /\bAC[a-fA-F0-9]{32}\b/,
  /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/
] as const;

const deliveryOperationStatusSummary = Object.freeze({
  commandExecution: "none",
  externalImpact: "none",
  mutation: "none",
  secretsDisplayed: false
} satisfies Pick<DeliveryOperationsStatus, "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed">);

function assertExactFields<T extends object>(value: T, fields: readonly string[], errorMessage: string) {
  const actualKeys = Reflect.ownKeys(value);

  if (actualKeys.length !== fields.length || actualKeys.some((key) => !fields.includes(String(key)))) {
    throw new Error(errorMessage);
  }
}

function assertNonblankString(value: unknown, errorMessage: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(errorMessage);
  }
}

function assertCleanCopy(value: string, errorMessage: string) {
  if (value !== value.trim() || value.includes("\n") || value.includes("\r") || value.includes("  ")) {
    throw new Error(errorMessage);
  }
}

function assertUniqueValues(values: readonly string[], errorMessage: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(errorMessage);
  }
}

function assertNoSecretLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenSecretMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertNoCommandLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenCommandMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertCheckpoint(checkpoint: DeliveryOperationCheckpoint) {
  assertExactFields(checkpoint, deliveryOperationCheckpointFields, "Invalid delivery operation checkpoint fields");
  assertNonblankString(checkpoint.name, "Invalid delivery operation checkpoint name");
  assertNonblankString(checkpoint.status, `Invalid delivery operation status for ${checkpoint.name}`);
  assertNonblankString(checkpoint.boundary, `Invalid delivery operation boundary for ${checkpoint.name}`);
  assertCleanCopy(checkpoint.name, `Whitespace-unsafe delivery operation checkpoint name for ${checkpoint.name}`);
  assertCleanCopy(checkpoint.status, `Whitespace-unsafe delivery operation status for ${checkpoint.name}`);
  assertCleanCopy(checkpoint.boundary, `Whitespace-unsafe delivery operation boundary for ${checkpoint.name}`);
  assertNoSecretLikeMetadata(checkpoint.name, `Secret-like delivery operation checkpoint name for ${checkpoint.name}`);
  assertNoSecretLikeMetadata(checkpoint.status, `Secret-like delivery operation status for ${checkpoint.name}`);
  assertNoSecretLikeMetadata(checkpoint.boundary, `Secret-like delivery operation boundary for ${checkpoint.name}`);
  assertNoCommandLikeMetadata(checkpoint.name, `Command-like delivery operation checkpoint name for ${checkpoint.name}`);
  assertNoCommandLikeMetadata(checkpoint.status, `Command-like delivery operation status for ${checkpoint.name}`);
  assertNoCommandLikeMetadata(checkpoint.boundary, `Command-like delivery operation boundary for ${checkpoint.name}`);

  if (!allowedDeliveryOperationStatusLabels.includes(checkpoint.status as DeliveryOperationStatusLabel)) {
    throw new Error(`Unsupported delivery operation status for ${checkpoint.name}`);
  }
}

function freezeCheckpoints(checkpoints: DeliveryOperationCheckpoint[]) {
  for (const checkpoint of checkpoints) {
    assertCheckpoint(checkpoint);
  }

  assertUniqueValues(
    checkpoints.map((checkpoint) => checkpoint.name),
    "Duplicate delivery operation checkpoint names"
  );

  return Object.freeze(
    checkpoints.map((checkpoint) =>
      Object.freeze({
        name: checkpoint.name,
        status: checkpoint.status,
        boundary: checkpoint.boundary
      })
    )
  );
}

function freezeSafetyBoundaries(boundaries: string[]) {
  for (const boundary of boundaries) {
    assertNonblankString(boundary, "Invalid delivery operation safety boundary");
    assertCleanCopy(boundary, "Whitespace-unsafe delivery operation safety boundary");
    assertNoSecretLikeMetadata(boundary, "Secret-like delivery operation safety boundary");
    assertNoCommandLikeMetadata(boundary, "Command-like delivery operation safety boundary");
  }

  assertUniqueValues(boundaries, "Duplicate delivery operation safety boundaries");

  const joinedBoundaries = boundaries.join(" ");
  const missingTerms = requiredDeliveryBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingTerms.length > 0) {
    throw new Error(`Missing delivery operation safety boundary terms: ${missingTerms.join(", ")}`);
  }

  return Object.freeze([...boundaries]);
}

function assertStatusSummary(
  summary: Pick<DeliveryOperationsStatus, "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed">
) {
  if (!allowedDeliveryOperationCommandExecutionStates.includes(summary.commandExecution)) {
    throw new Error(`Unsupported delivery operation command execution state: ${summary.commandExecution}`);
  }

  if (!allowedDeliveryOperationExternalImpactStates.includes(summary.externalImpact)) {
    throw new Error(`Unsupported delivery operation external impact state: ${summary.externalImpact}`);
  }

  if (!allowedDeliveryOperationMutationStates.includes(summary.mutation)) {
    throw new Error(`Unsupported delivery operation mutation state: ${summary.mutation}`);
  }

  if (!allowedDeliveryOperationSecretsDisplayedStates.includes(summary.secretsDisplayed)) {
    throw new Error(`Unsupported delivery operation secrets-displayed state: ${summary.secretsDisplayed}`);
  }
}

export const deliveryOperationCheckpoints = freezeCheckpoints([
  {
    name: "Message rows",
    status: "local only",
    boundary: "Existing message rows are counted and listed without changing delivery state or message bodies."
  },
  {
    name: "Provider status",
    status: "provider reported",
    boundary: "Stored provider status labels are displayed as local metadata without provider calls or lookups."
  },
  {
    name: "Delivery retry",
    status: "blocked",
    boundary: "Retry actions are unavailable here; local review cannot enqueue jobs, replay webhooks, or send SMS."
  }
]);

export const deliveryOperationSafetyBoundaries = freezeSafetyBoundaries([
  "This view reviews existing local delivery metadata only and does not send SMS or retry messages.",
  "webhook replay, provider calls, provider lookups, billing, notifications, and queue mutations are unavailable here.",
  "Message, campaign, contact, and delivery-status mutations stay outside this read-only operations surface.",
  "No secrets, provider tokens, raw environment values, live messaging toggles, or live feature enablement are displayed."
]);

export function getDeliveryOperationsStatus(): DeliveryOperationsStatus {
  assertStatusSummary(deliveryOperationStatusSummary);

  return Object.freeze({
    checkpointCount: deliveryOperationCheckpoints.length,
    safetyBoundaryCount: deliveryOperationSafetyBoundaries.length,
    commandExecution: deliveryOperationStatusSummary.commandExecution,
    externalImpact: deliveryOperationStatusSummary.externalImpact,
    mutation: deliveryOperationStatusSummary.mutation,
    secretsDisplayed: deliveryOperationStatusSummary.secretsDisplayed,
    checkpoints: freezeCheckpoints(deliveryOperationCheckpoints.map((checkpoint) => ({ ...checkpoint }))),
    safetyBoundaries: freezeSafetyBoundaries([...deliveryOperationSafetyBoundaries])
  });
}
