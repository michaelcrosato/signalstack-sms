import { A2pRegistrationStatus, ConsentStatus, type ComplianceProfile } from "@prisma/client";

export type MessagingHardGateInput = {
  demoMode: boolean;
  liveMessagingEnabled: boolean;
  messagingProvider: string;
  complianceProfile?: Pick<
    ComplianceProfile,
    | "businessName"
    | "messagingUseCase"
    | "optInDescription"
    | "privacyPolicyUrl"
    | "termsOfServiceUrl"
    | "a2pRegistrationStatus"
  > | null;
  contact?: {
    consentStatus: ConsentStatus;
    optedOutAt: Date | null;
    archivedAt: Date | null;
  } | null;
};

export type MessagingHardGateResult = {
  allowed: boolean;
  reasons: string[];
};

export function liveMessagingIsBlocked() {
  return process.env.LIVE_MESSAGING_ENABLED !== "true";
}

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
  if (input.contact) {
    if (input.contact.archivedAt) {
      reasons.push("CONTACT_ARCHIVED");
    }
    if (input.contact.consentStatus !== ConsentStatus.OPTED_IN) {
      reasons.push("CONSENT_NOT_OPTED_IN");
    }
    if (input.contact.optedOutAt || input.contact.consentStatus === ConsentStatus.OPTED_OUT) {
      reasons.push("CONTACT_OPTED_OUT");
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
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
