import type { ComplianceProfile } from "@prisma/client";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";
import { productComplianceFields } from "@/lib/product/compliance-fields";

export { productComplianceFields };

const productComplianceMetricRowItems = [
  { key: "profileFields", label: "Profile Fields" },
  { key: "a2pStatus", label: "A2P Status" },
  { key: "liveMessaging", label: "Live Messaging" },
  { key: "blockers", label: "Blockers" }
] as const;

type ProductComplianceMetricKey = (typeof productComplianceMetricRowItems)[number]["key"];

export const productComplianceMetricRows = Object.freeze(
  productComplianceMetricRowItems.map((row) => Object.freeze({ ...row }))
);

const productComplianceBlockerCopyItems = {
  LIVE_MESSAGING_DISABLED: "Live messaging flag is disabled.",
  DEMO_MODE_ENABLED: "Demo mode is enabled for this organization.",
  DUMMY_PROVIDER_SELECTED: "Dummy provider is selected.",
  COMPLIANCE_PROFILE_INCOMPLETE: "Required compliance profile fields are missing.",
  A2P_NOT_APPROVED: "A2P registration is not approved.",
  CONTACT_ARCHIVED: "Selected contact is archived.",
  CONSENT_NOT_OPTED_IN: "Selected contact is not opted in.",
  CONTACT_OPTED_OUT: "Selected contact has opted out."
} as const;

export const productComplianceBlockerCopy = Object.freeze({ ...productComplianceBlockerCopyItems });

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
  const summary = {
    complete: complianceProfileIsComplete(profile),
    completeFields,
    requiredFields: fields.length,
    a2pRegistrationStatus: profile.a2pRegistrationStatus,
    liveMessagingAllowed: gate.allowed,
    blockerCount: gate.reasons.length,
    demoMode: input.demoMode,
    liveMessagingEnabled,
    messagingProvider
  };
  const metricValues: Record<ProductComplianceMetricKey, { value: string; detail: string }> = {
    profileFields: {
      value: `${summary.completeFields}/${summary.requiredFields}`,
      detail: summary.complete ? "complete" : "needs review"
    },
    a2pStatus: {
      value: summary.a2pRegistrationStatus,
      detail: "registration gate"
    },
    liveMessaging: {
      value: summary.liveMessagingAllowed ? "review" : "blocked",
      detail: summary.liveMessagingEnabled ? "flag enabled" : "flag disabled"
    },
    blockers: {
      value: String(summary.blockerCount),
      detail: "hard-gate reasons"
    }
  };

  return {
    summary,
    metrics: productComplianceMetricRows.map((row) => {
      const metric = metricValues[row.key];

      return {
        key: row.key,
        label: row.label,
        value: metric.value,
        detail: metric.detail
      };
    }),
    fields,
    blockers: gate.reasons.map((reason) => ({
      reason,
      description:
        productComplianceBlockerCopy[reason as keyof typeof productComplianceBlockerCopy] ??
        "Messaging hard gate is blocking live sends."
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
