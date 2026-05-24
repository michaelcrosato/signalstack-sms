import type { ComplianceProfile } from "@prisma/client";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";

const productComplianceFieldItems = [
  {
    key: "businessName",
    label: "Business name",
    guidance: "Legal sender identity for campaign registration and customer trust."
  },
  {
    key: "messagingUseCase",
    label: "Messaging use case",
    guidance: "Plain-language description of expected SMS content."
  },
  {
    key: "optInDescription",
    label: "Opt-in description",
    guidance: "How contacts knowingly consent before receiving messages."
  },
  {
    key: "privacyPolicyUrl",
    label: "Privacy policy URL",
    guidance: "Public policy link required before live registration review."
  },
  {
    key: "termsOfServiceUrl",
    label: "Terms of service URL",
    guidance: "Public terms link required before live registration review."
  }
] as const;

export const productComplianceFields = Object.freeze(
  productComplianceFieldItems.map((field) => Object.freeze({ ...field }))
);

const blockerCopy = {
  LIVE_MESSAGING_DISABLED: "Live messaging flag is disabled.",
  DEMO_MODE_ENABLED: "Demo mode is enabled for this organization.",
  DUMMY_PROVIDER_SELECTED: "Dummy provider is selected.",
  COMPLIANCE_PROFILE_INCOMPLETE: "Required compliance profile fields are missing.",
  A2P_NOT_APPROVED: "A2P registration is not approved.",
  CONTACT_ARCHIVED: "Selected contact is archived.",
  CONSENT_NOT_OPTED_IN: "Selected contact is not opted in.",
  CONTACT_OPTED_OUT: "Selected contact has opted out."
} as const;

type ProductComplianceInput = {
  orgId: string;
  demoMode: boolean;
  liveMessagingEnabled?: boolean;
  messagingProvider?: string;
};

export async function getProductCompliance(input: ProductComplianceInput) {
  const profile = await getOrCreateComplianceProfile(input.orgId);
  const liveMessagingEnabled = input.liveMessagingEnabled ?? process.env.LIVE_MESSAGING_ENABLED === "true";
  const messagingProvider = input.messagingProvider ?? process.env.MESSAGING_PROVIDER ?? "dummy";
  const gate = evaluateMessagingHardGate({
    demoMode: input.demoMode,
    liveMessagingEnabled,
    messagingProvider,
    complianceProfile: profile
  });
  const fields = productComplianceFields.map((field) => ({
    key: field.key,
    label: field.label,
    guidance: field.guidance,
    complete: Boolean(profile[field.key]),
    status: profile[field.key] ? "present" : "missing"
  }));
  const completeFields = fields.filter((field) => field.complete).length;

  return {
    summary: {
      complete: complianceProfileIsComplete(profile),
      completeFields,
      requiredFields: fields.length,
      a2pRegistrationStatus: profile.a2pRegistrationStatus,
      liveMessagingAllowed: gate.allowed,
      blockerCount: gate.reasons.length,
      demoMode: input.demoMode,
      liveMessagingEnabled,
      messagingProvider
    },
    fields,
    blockers: gate.reasons.map((reason) => ({
      reason,
      description: blockerCopy[reason as keyof typeof blockerCopy] ?? "Messaging hard gate is blocking live sends."
    })),
    profile: pickProfileTimestamps(profile)
  };
}

function pickProfileTimestamps(profile: ComplianceProfile) {
  return {
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}
