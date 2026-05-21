import { describe, expect, it } from "vitest";
import {
  allowedReadinessAuditOperationActions,
  allowedReadinessAuditOperationCommandExecutionStates,
  allowedReadinessAuditOperationExternalImpactStates,
  allowedReadinessAuditOperationExportLimits,
  allowedReadinessAuditOperationMutationStates,
  allowedReadinessAuditOperationSecretsDisplayedStates,
  allowedReadinessAuditOperationSubjectTypes,
  getReadinessAuditOperationsStatus,
  readinessAuditOperationSafetyBoundaries
} from "@/lib/operations/readiness-audit-operations";

const publicStatusFields = [
  "actionCount",
  "subjectTypeCount",
  "safetyBoundaryCount",
  "exportLimit",
  "commandExecution",
  "externalImpact",
  "mutation",
  "secretsDisplayed",
  "actions",
  "subjectTypes",
  "safetyBoundaries"
];

function sortedFields(value: object) {
  return Object.keys(value).sort();
}

describe("getReadinessAuditOperationsStatus", () => {
  it("reports required readiness audit filters and read-only summary states", () => {
    const status = getReadinessAuditOperationsStatus();

    expect(status.actionCount).toBe(4);
    expect(status.subjectTypeCount).toBe(3);
    expect(status.safetyBoundaryCount).toBe(4);
    expect(status.exportLimit).toBe(200);
    expect(status.commandExecution).toBe("none");
    expect(status.externalImpact).toBe("none");
    expect(status.mutation).toBe("none");
    expect(status.secretsDisplayed).toBe(false);
    expect(status.actions).toEqual([
      "COMPLIANCE_PROFILE_UPDATED",
      "PROVIDER_NUMBER_UPSERTED",
      "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
      "PROVIDER_CREDENTIAL_METADATA_DELETED"
    ]);
    expect(status.subjectTypes).toEqual(["ComplianceProfile", "ProviderPhoneNumber", "ProviderCredential"]);
  });

  it("exposes only public readiness audit operations fields", () => {
    const status = getReadinessAuditOperationsStatus();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
  });

  it("keeps exported and per-call readiness audit snapshots frozen", () => {
    const firstStatus = getReadinessAuditOperationsStatus();
    const secondStatus = getReadinessAuditOperationsStatus();

    expect(Object.isFrozen(allowedReadinessAuditOperationActions)).toBe(true);
    expect(Object.isFrozen(allowedReadinessAuditOperationSubjectTypes)).toBe(true);
    expect(Object.isFrozen(allowedReadinessAuditOperationExportLimits)).toBe(true);
    expect(Object.isFrozen(allowedReadinessAuditOperationCommandExecutionStates)).toBe(true);
    expect(Object.isFrozen(readinessAuditOperationSafetyBoundaries)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.actions)).toBe(true);
    expect(Object.isFrozen(firstStatus.subjectTypes)).toBe(true);
    expect(Object.isFrozen(firstStatus.safetyBoundaries)).toBe(true);
    expect(firstStatus.actions).not.toBe(secondStatus.actions);
    expect(firstStatus.subjectTypes).not.toBe(secondStatus.subjectTypes);
    expect(firstStatus.safetyBoundaries).not.toBe(secondStatus.safetyBoundaries);
    expect(() => (firstStatus.actions as unknown as string[]).pop()).toThrow(TypeError);
    expect(() => (firstStatus.safetyBoundaries as unknown as string[]).push("unsafe")).toThrow(TypeError);
  });

  it("keeps every exported readiness audit vocabulary frozen against caller mutation", () => {
    const vocabularies = [
      allowedReadinessAuditOperationActions,
      allowedReadinessAuditOperationSubjectTypes,
      allowedReadinessAuditOperationExportLimits,
      allowedReadinessAuditOperationCommandExecutionStates,
      allowedReadinessAuditOperationExternalImpactStates,
      allowedReadinessAuditOperationMutationStates,
      allowedReadinessAuditOperationSecretsDisplayedStates
    ];

    for (const vocabulary of vocabularies) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(() => ((vocabulary as unknown) as unknown[]).push("unsafe")).toThrow(TypeError);
    }
  });

  it("keeps readiness audit operation metadata whitespace-clean", () => {
    const staticCopy = [
      ...allowedReadinessAuditOperationActions,
      ...allowedReadinessAuditOperationSubjectTypes,
      ...readinessAuditOperationSafetyBoundaries
    ];

    expect(staticCopy.filter((copy) => copy.trim().length === 0)).toEqual([]);
    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps readiness audit values inside documented local-only vocabularies", () => {
    const status = getReadinessAuditOperationsStatus();

    expect(allowedReadinessAuditOperationExportLimits).toEqual([200]);
    expect(allowedReadinessAuditOperationExportLimits.every((limit) => Number.isInteger(limit) && limit > 0)).toBe(true);
    expect(allowedReadinessAuditOperationCommandExecutionStates).toEqual(["none"]);
    expect(allowedReadinessAuditOperationExternalImpactStates).toEqual(["none"]);
    expect(allowedReadinessAuditOperationMutationStates).toEqual(["none"]);
    expect(allowedReadinessAuditOperationSecretsDisplayedStates).toEqual([false]);
    expect(Object.isFrozen(allowedReadinessAuditOperationExportLimits)).toBe(true);
    expect(Object.isFrozen(allowedReadinessAuditOperationCommandExecutionStates)).toBe(true);
    expect(Object.isFrozen(allowedReadinessAuditOperationExternalImpactStates)).toBe(true);
    expect(Object.isFrozen(allowedReadinessAuditOperationMutationStates)).toBe(true);
    expect(Object.isFrozen(allowedReadinessAuditOperationSecretsDisplayedStates)).toBe(true);
    expect(allowedReadinessAuditOperationExportLimits).toContain(status.exportLimit);
    expect(allowedReadinessAuditOperationCommandExecutionStates).toContain(status.commandExecution);
    expect(allowedReadinessAuditOperationExternalImpactStates).toContain(status.externalImpact);
    expect(allowedReadinessAuditOperationMutationStates).toContain(status.mutation);
    expect(allowedReadinessAuditOperationSecretsDisplayedStates).toContain(status.secretsDisplayed);
  });

  it("keeps readiness audit safety boundaries explicit about no-impact behavior", () => {
    const boundaryCopy = readinessAuditOperationSafetyBoundaries.join(" ");

    expect(boundaryCopy).toContain("audit events");
    expect(boundaryCopy).toContain("tenant-scoped");
    expect(boundaryCopy).toContain("CSV");
    expect(boundaryCopy).toContain("secrets");
    expect(boundaryCopy).toContain("provider calls");
    expect(boundaryCopy).toContain("billing");
    expect(boundaryCopy).toContain("notifications");
    expect(boundaryCopy).toContain("SMS");
    expect(boundaryCopy).toContain("email");
    expect(boundaryCopy).toContain("live AI");
    expect(boundaryCopy).toContain("mutations");
  });

  it("keeps readiness audit operation inventory order stable for local review pages", () => {
    expect(allowedReadinessAuditOperationActions).toEqual([
      "COMPLIANCE_PROFILE_UPDATED",
      "PROVIDER_NUMBER_UPSERTED",
      "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
      "PROVIDER_CREDENTIAL_METADATA_DELETED"
    ]);
    expect(allowedReadinessAuditOperationSubjectTypes).toEqual([
      "ComplianceProfile",
      "ProviderPhoneNumber",
      "ProviderCredential"
    ]);
    expect(readinessAuditOperationSafetyBoundaries).toEqual([
      "This view reads tenant-scoped audit events and links to the existing bounded CSV export only.",
      "It does not create, update, delete, replay, perform mutations, or alter audit events or readiness metadata.",
      "Displayed metadata excludes secrets, raw provider credentials, token fingerprints, provider verification results, and environment values.",
      "Reviewing readiness history does not trigger provider calls, billing records, live AI, notifications, SMS, email, or live feature enablement."
    ]);
  });

  it("keeps readiness audit operation identifiers unique before local review pages render them", () => {
    expect(new Set(allowedReadinessAuditOperationActions).size).toBe(allowedReadinessAuditOperationActions.length);
    expect(new Set(allowedReadinessAuditOperationSubjectTypes).size).toBe(allowedReadinessAuditOperationSubjectTypes.length);
    expect(new Set(readinessAuditOperationSafetyBoundaries).size).toBe(readinessAuditOperationSafetyBoundaries.length);
  });

  it("keeps readiness audit operation static metadata free of secret-like literals", () => {
    const staticCopy = [
      ...allowedReadinessAuditOperationActions,
      ...allowedReadinessAuditOperationSubjectTypes,
      ...readinessAuditOperationSafetyBoundaries
    ];
    const secretLikePatterns = [
      /\bsk_(?:live|test)_[A-Za-z0-9]+/,
      /\bpk_live_[A-Za-z0-9]+/,
      /\bAC[a-fA-F0-9]{32}\b/,
      /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
      /\bBearer\s+[A-Za-z0-9._-]{12,}/
    ];

    expect(staticCopy.filter((copy) => secretLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });

  it("keeps readiness audit operation static metadata free of command-like literals", () => {
    const staticCopy = [
      ...allowedReadinessAuditOperationActions,
      ...allowedReadinessAuditOperationSubjectTypes,
      ...readinessAuditOperationSafetyBoundaries
    ];
    const commandLikePatterns = [
      /\bnpm\s+run\b/i,
      /\bnpx\b/i,
      /\bpowershell\b/i,
      /\bcurl\b/i,
      /\bInvoke-WebRequest\b/i
    ];

    expect(staticCopy.filter((copy) => commandLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });
});
