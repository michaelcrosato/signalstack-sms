import { A2pRegistrationStatus, type ComplianceProfile } from "@prisma/client";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";

export type ProviderSettingsInput = {
  demoMode: boolean;
  liveMessagingEnabled: boolean;
  messagingProvider: string;
  complianceProfile?: ComplianceProfile | null;
  env: Record<string, string | undefined>;
};

export function getProviderSettings(input: ProviderSettingsInput) {
  const twilioConfigured = Boolean(
    input.env.TWILIO_ACCOUNT_SID && input.env.TWILIO_AUTH_TOKEN && input.env.TWILIO_FROM_NUMBER
  );
  const gate = evaluateMessagingHardGate({
    demoMode: input.demoMode,
    liveMessagingEnabled: input.liveMessagingEnabled,
    messagingProvider: input.messagingProvider,
    complianceProfile: input.complianceProfile
  });
  const blockers = [...gate.reasons];

  if (input.messagingProvider === "twilio" && !twilioConfigured) {
    blockers.push("TWILIO_CREDENTIALS_INCOMPLETE");
  }

  return {
    provider: input.messagingProvider,
    demoMode: input.demoMode,
    liveMessagingEnabled: input.liveMessagingEnabled,
    liveMessagingAllowed: gate.allowed && (input.messagingProvider !== "twilio" || twilioConfigured),
    twilio: {
      accountSidConfigured: Boolean(input.env.TWILIO_ACCOUNT_SID),
      authTokenConfigured: Boolean(input.env.TWILIO_AUTH_TOKEN),
      fromNumberConfigured: Boolean(input.env.TWILIO_FROM_NUMBER),
      configured: twilioConfigured
    },
    compliance: {
      complete: complianceProfileIsComplete(input.complianceProfile),
      a2pRegistrationStatus: input.complianceProfile?.a2pRegistrationStatus ?? A2pRegistrationStatus.NOT_STARTED
    },
    blockers
  };
}
