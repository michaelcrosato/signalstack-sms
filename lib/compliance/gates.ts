import { A2pRegistrationStatus, ConsentStatus, type ComplianceProfile } from "@prisma/client";
import { isWithinQuietHours } from "@/lib/compliance/quiet-hours";
import { resolveTimezoneFromPhone } from "@/lib/compliance/area-codes";
import { hasCompleteConsentEvidence } from "@/lib/compliance/consent-evidence";

export type MessagingHardGateInput = {
  demoMode: boolean;
  liveMessagingEnabled: boolean;
  messagingProvider: string;
  complianceProfile?: Partial<ComplianceProfile> | null;
  contact?: {
    phone?: string | null;
    state?: string | null;
    consentStatus: ConsentStatus;
    optedOutAt: Date | null;
    archivedAt: Date | null;
    // SPEC-009 consent evidence (TCPA: number + exact timestamp + capture method + verbatim disclosure).
    // The number is the contact phone; the other three are stored on Contact and required to send live.
    consentCapturedAt?: Date | null;
    consentMethod?: string | null;
    consentDisclosure?: string | null;
  } | null;
  // Suppression list check (org-level or global).
  suppressed?: boolean;
  suppressionReason?: string | null;
  // Optional TCPA quiet-hours check. When supplied, sending outside 08:00–21:00 in the given timezone
  // adds a QUIET_HOURS block reason. Omitted by demo/non-time-sensitive callers (backward compatible).
  quietHours?: {
    now: Date;
    timeZone: string;
    state?: string;
  };
};

export type MessagingHardGateResult = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateMessagingHardGate(input: MessagingHardGateInput): MessagingHardGateResult {
  const reasons: string[] = [];

  if (!input.liveMessagingEnabled) {
    reasons.push("LIVE_MESSAGING_DISABLED");
  }
  if (input.demoMode) {
    reasons.push("DEMO_MODE_ENABLED");
  }
  if (input.messagingProvider === "dummy") {
    reasons.push("DUMMY_PROVIDER_SELECTED");
  }
  if (!complianceProfileIsComplete(input.complianceProfile)) {
    reasons.push("COMPLIANCE_PROFILE_INCOMPLETE");
  }
  if (input.complianceProfile?.a2pRegistrationStatus !== A2pRegistrationStatus.APPROVED) {
    reasons.push("A2P_NOT_APPROVED");
  }
  if (input.suppressed || input.suppressionReason) {
    reasons.push("CONTACT_SUPPRESSED");
  }
  if (input.contact) {
    if (input.contact.archivedAt) {
      reasons.push("CONTACT_ARCHIVED");
    }
    if (input.contact.consentStatus === ConsentStatus.PENDING_DOUBLE_OPT_IN) {
      reasons.push("PENDING_DOUBLE_OPT_IN");
    } else if (input.contact.consentStatus !== ConsentStatus.OPTED_IN) {
      reasons.push("CONSENT_NOT_OPTED_IN");
    }
    if (input.contact.optedOutAt || input.contact.consentStatus === ConsentStatus.OPTED_OUT) {
      reasons.push("CONTACT_OPTED_OUT");
    }
    if (!hasConsentEvidence(input.contact)) {
      reasons.push("CONSENT_EVIDENCE_MISSING");
    }
  }

  if (input.quietHours) {
    let resolvedTimeZone = input.quietHours.timeZone;
    let resolvedState = input.quietHours.state;

    if (input.contact?.phone) {
      // Fall back to the org-configured quiet-hours timezone when the contact's area code is not in the map.
      resolvedTimeZone = resolveTimezoneFromPhone(input.contact.phone, input.quietHours.timeZone);
    }
    if (input.contact?.state) {
      resolvedState = input.contact.state;
    }

    if (isWithinQuietHours(input.quietHours.now, resolvedTimeZone, resolvedState)) {
      reasons.push("QUIET_HOURS");
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}

export function hasConsentEvidence(contact: {
  consentCapturedAt?: Date | null;
  consentMethod?: string | null;
  consentDisclosure?: string | null;
}): boolean {
  return hasCompleteConsentEvidence(contact);
}

export function complianceProfileIsComplete(
  profile: MessagingHardGateInput["complianceProfile"]
) {
  return Boolean(
    profile?.businessName &&
      profile.messagingUseCase &&
      profile.optInDescription &&
      profile.privacyPolicyUrl &&
      profile.termsOfServiceUrl
  );
}
