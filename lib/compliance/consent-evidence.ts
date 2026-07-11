export type ConsentEvidence = {
  consentCapturedAt?: Date | null;
  consentMethod?: string | null;
  consentDisclosure?: string | null;
};

function nonEmpty(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasCompleteConsentEvidence(evidence: ConsentEvidence) {
  return Boolean(
    evidence.consentCapturedAt &&
      Number.isFinite(evidence.consentCapturedAt.getTime()) &&
      nonEmpty(evidence.consentMethod) &&
      nonEmpty(evidence.consentDisclosure)
  );
}

export function hasAnyConsentEvidence(evidence: ConsentEvidence) {
  return [evidence.consentCapturedAt, evidence.consentMethod, evidence.consentDisclosure].some(
    (value) => value !== null && value !== undefined
  );
}
