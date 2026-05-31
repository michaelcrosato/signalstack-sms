import { A2pRegistrationStatus, type ComplianceProfile, type ProviderCredential } from "@prisma/client";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { redactSecret } from "@/lib/env/redact";

export type ProviderSettingsInput = {
  demoMode: boolean;
  liveMessagingEnabled: boolean;
  messagingProvider: string;
  complianceProfile?: ComplianceProfile | null;
  providerCredential?: ProviderCredential | null;
  env: Record<string, string | undefined>;
};

export function getProviderSettings(input: ProviderSettingsInput) {
  const envTwilioConfigured = Boolean(
    input.env.TWILIO_ACCOUNT_SID && input.env.TWILIO_AUTH_TOKEN && input.env.TWILIO_FROM_NUMBER
  );
  const metadataTwilioConfigured = Boolean(
    input.providerCredential?.provider === "twilio" &&
      input.providerCredential.accountSidRedacted &&
      input.providerCredential.authTokenConfigured &&
      input.providerCredential.fromNumberRedacted
  );
  const twilioConfigured = envTwilioConfigured || metadataTwilioConfigured;
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
      accountSidConfigured: Boolean(input.env.TWILIO_ACCOUNT_SID || input.providerCredential?.accountSidRedacted),
      authTokenConfigured: Boolean(input.env.TWILIO_AUTH_TOKEN || input.providerCredential?.authTokenConfigured),
      fromNumberConfigured: Boolean(input.env.TWILIO_FROM_NUMBER || input.providerCredential?.fromNumberRedacted),
      configured: twilioConfigured,
      source: metadataTwilioConfigured ? input.providerCredential?.source ?? "local_metadata" : "environment",
      accountSidRedacted: metadataTwilioConfigured
        ? input.providerCredential?.accountSidRedacted ?? null
        : redactSecret(input.env.TWILIO_ACCOUNT_SID),
      fromNumberRedacted: metadataTwilioConfigured
        ? input.providerCredential?.fromNumberRedacted ?? null
        : redactSecret(input.env.TWILIO_FROM_NUMBER)
    },
    compliance: {
      complete: complianceProfileIsComplete(input.complianceProfile),
      a2pRegistrationStatus: input.complianceProfile?.a2pRegistrationStatus ?? A2pRegistrationStatus.NOT_STARTED
    },
    blockers
  };
}
