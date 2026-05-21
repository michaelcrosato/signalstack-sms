export const allowedReadinessAuditOperationActions = Object.freeze([
  "COMPLIANCE_PROFILE_UPDATED",
  "PROVIDER_NUMBER_UPSERTED",
  "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
  "PROVIDER_CREDENTIAL_METADATA_DELETED"
] as const);

export const allowedReadinessAuditOperationSubjectTypes = Object.freeze([
  "ComplianceProfile",
  "ProviderPhoneNumber",
  "ProviderCredential"
] as const);

export const allowedReadinessAuditOperationCommandExecutionStates = Object.freeze(["none"] as const);
export const allowedReadinessAuditOperationExternalImpactStates = Object.freeze(["none"] as const);
export const allowedReadinessAuditOperationMutationStates = Object.freeze(["none"] as const);
export const allowedReadinessAuditOperationSecretsDisplayedStates = Object.freeze([false] as const);
export const allowedReadinessAuditOperationExportLimits = Object.freeze([200] as const);

export type ReadinessAuditOperationAction = (typeof allowedReadinessAuditOperationActions)[number];
export type ReadinessAuditOperationSubjectType = (typeof allowedReadinessAuditOperationSubjectTypes)[number];
export type ReadinessAuditOperationCommandExecutionState =
  (typeof allowedReadinessAuditOperationCommandExecutionStates)[number];
export type ReadinessAuditOperationExternalImpactState =
  (typeof allowedReadinessAuditOperationExternalImpactStates)[number];
export type ReadinessAuditOperationMutationState = (typeof allowedReadinessAuditOperationMutationStates)[number];
export type ReadinessAuditOperationSecretsDisplayedState =
  (typeof allowedReadinessAuditOperationSecretsDisplayedStates)[number];
export type ReadinessAuditOperationExportLimit = (typeof allowedReadinessAuditOperationExportLimits)[number];

export type ReadinessAuditOperationsStatus = {
  actionCount: number;
  subjectTypeCount: number;
  safetyBoundaryCount: number;
  exportLimit: ReadinessAuditOperationExportLimit;
  commandExecution: ReadinessAuditOperationCommandExecutionState;
  externalImpact: ReadinessAuditOperationExternalImpactState;
  mutation: ReadinessAuditOperationMutationState;
  secretsDisplayed: ReadinessAuditOperationSecretsDisplayedState;
  actions: readonly ReadinessAuditOperationAction[];
  subjectTypes: readonly ReadinessAuditOperationSubjectType[];
  safetyBoundaries: readonly string[];
};

const readinessAuditOperationExportLimit = 200 satisfies ReadinessAuditOperationExportLimit;
const requiredReadinessAuditBoundaryTerms = [
  "audit events",
  "tenant-scoped",
  "CSV",
  "secrets",
  "provider calls",
  "billing",
  "notifications",
  "SMS",
  "email",
  "live AI",
  "mutations"
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

const readinessAuditOperationStatusSummary = Object.freeze({
  commandExecution: "none",
  externalImpact: "none",
  mutation: "none",
  secretsDisplayed: false
} satisfies Pick<ReadinessAuditOperationsStatus, "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed">);

export const readinessAuditOperationSafetyBoundaries = freezeSafetyBoundaries([
  "This view reads tenant-scoped audit events and links to the existing bounded CSV export only.",
  "It does not create, update, delete, replay, perform mutations, or alter audit events or readiness metadata.",
  "Displayed metadata excludes secrets, raw provider credentials, token fingerprints, provider verification results, and environment values.",
  "Reviewing readiness history does not trigger provider calls, billing records, live AI, notifications, SMS, email, or live feature enablement."
]);

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

function freezeVocabulary<T extends string>(values: readonly T[], label: string) {
  for (const value of values) {
    assertNonblankString(value, `Invalid readiness audit operation ${label}`);
    assertCleanCopy(value, `Whitespace-unsafe readiness audit operation ${label}`);
    assertNoSecretLikeMetadata(value, `Secret-like readiness audit operation ${label}`);
    assertNoCommandLikeMetadata(value, `Command-like readiness audit operation ${label}`);
  }

  assertUniqueValues(values, `Duplicate readiness audit operation ${label}s`);

  return Object.freeze([...values]);
}

function freezeSafetyBoundaries(boundaries: string[]) {
  const frozenBoundaries = freezeVocabulary(boundaries, "safety boundary");
  const joinedBoundaries = frozenBoundaries.join(" ");
  const missingBoundaryTerms = requiredReadinessAuditBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingBoundaryTerms.length > 0) {
    throw new Error(`Missing readiness audit operation safety boundary terms: ${missingBoundaryTerms.join(", ")}`);
  }

  return frozenBoundaries;
}

function assertStatusSummary(
  summary: Pick<
    ReadinessAuditOperationsStatus,
    "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed" | "exportLimit"
  >
) {
  if (!allowedReadinessAuditOperationExportLimits.includes(summary.exportLimit)) {
    throw new Error(`Unsupported readiness audit operation export limit: ${summary.exportLimit}`);
  }

  if (!allowedReadinessAuditOperationCommandExecutionStates.includes(summary.commandExecution)) {
    throw new Error(`Unsupported readiness audit operation command execution state: ${summary.commandExecution}`);
  }

  if (!allowedReadinessAuditOperationExternalImpactStates.includes(summary.externalImpact)) {
    throw new Error(`Unsupported readiness audit operation external impact state: ${summary.externalImpact}`);
  }

  if (!allowedReadinessAuditOperationMutationStates.includes(summary.mutation)) {
    throw new Error(`Unsupported readiness audit operation mutation state: ${summary.mutation}`);
  }

  if (!allowedReadinessAuditOperationSecretsDisplayedStates.includes(summary.secretsDisplayed)) {
    throw new Error(`Unsupported readiness audit operation secrets-displayed state: ${summary.secretsDisplayed}`);
  }
}

export function getReadinessAuditOperationsStatus(): ReadinessAuditOperationsStatus {
  const statusSummary = {
    exportLimit: readinessAuditOperationExportLimit,
    ...readinessAuditOperationStatusSummary
  } satisfies Pick<
    ReadinessAuditOperationsStatus,
    "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed" | "exportLimit"
  >;

  assertStatusSummary(statusSummary);

  return Object.freeze({
    actionCount: allowedReadinessAuditOperationActions.length,
    subjectTypeCount: allowedReadinessAuditOperationSubjectTypes.length,
    safetyBoundaryCount: readinessAuditOperationSafetyBoundaries.length,
    exportLimit: statusSummary.exportLimit,
    commandExecution: statusSummary.commandExecution,
    externalImpact: statusSummary.externalImpact,
    mutation: statusSummary.mutation,
    secretsDisplayed: statusSummary.secretsDisplayed,
    actions: freezeVocabulary(allowedReadinessAuditOperationActions, "action"),
    subjectTypes: freezeVocabulary(allowedReadinessAuditOperationSubjectTypes, "subject type"),
    safetyBoundaries: freezeSafetyBoundaries([...readinessAuditOperationSafetyBoundaries])
  });
}
