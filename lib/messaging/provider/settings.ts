import {
  A2pRegistrationStatus,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus,
  type ComplianceProfile,
  type ProviderCredential
} from "@prisma/client";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";

export type ProviderSettingsInput = {
  demoMode: boolean;
  liveMessagingEnabled: boolean;
  messagingProvider: string;
  complianceProfile?: Partial<ComplianceProfile> | null;
  providerAccounts?: readonly Readonly<{
    status: string;
    revokedAt: Date | string | null;
    externalAccountIdLast4: string;
  }>[];
  providerPhoneNumbers?: readonly Readonly<{
    status: string;
    disabledAt: Date | string | null;
    phoneNumber: string;
  }>[];
  /** Legacy metadata is display-only and never proves M4 credential or ownership readiness. */
  providerCredential?: ProviderCredential | null;
  env: Record<string, string | undefined>;
};

export function getProviderSettings(input: ProviderSettingsInput) {
  const envTwilioConfigured = Boolean(
    input.env.TWILIO_ACCOUNT_SID &&
      input.env.TWILIO_AUTH_TOKEN &&
      (input.env.TWILIO_FROM_NUMBER || input.env.TWILIO_MESSAGING_SERVICE_SID)
  );
  const legacyMetadataPresent = Boolean(
    input.providerCredential?.provider === "twilio" &&
      input.providerCredential.accountSidRedacted &&
      input.providerCredential.authTokenConfigured &&
      input.providerCredential.fromNumberRedacted
  );
  const verifiedAccounts = (input.providerAccounts ?? []).filter(
    (account) => account.status === ProviderAccountStatus.VERIFIED && account.revokedAt === null
  );
  const verifiedNumbers = (input.providerPhoneNumbers ?? []).filter(
    (number) =>
      number.status === ProviderPhoneNumberStatus.VERIFIED && number.disabledAt === null
  );
  const storedTwilioConfigured = verifiedAccounts.length > 0 && verifiedNumbers.length > 0;
  const twilioConfigured = envTwilioConfigured || storedTwilioConfigured;
  const gate = evaluateMessagingHardGate({
    demoMode: input.demoMode,
    liveMessagingEnabled: input.liveMessagingEnabled,
    messagingProvider: input.messagingProvider,
    complianceProfile: input.complianceProfile
  });
  const blockers = [...gate.reasons];

  if (input.messagingProvider === "twilio" && !storedTwilioConfigured) {
    blockers.push("TWILIO_CREDENTIALS_INCOMPLETE");
  }
  if (input.messagingProvider === "twilio" && verifiedAccounts.length > 0 && verifiedNumbers.length === 0) {
    blockers.push("TWILIO_SENDER_NOT_VERIFIED");
  }
  const accountLast4 = verifiedAccounts[0]?.externalAccountIdLast4;
  const numberLast4 = verifiedNumbers[0]?.phoneNumber.slice(-4);

  return {
    provider: input.messagingProvider,
    demoMode: input.demoMode,
    liveMessagingEnabled: input.liveMessagingEnabled,
    liveMessagingAllowed: gate.allowed && storedTwilioConfigured,
    twilio: {
      accountSidConfigured: Boolean(input.env.TWILIO_ACCOUNT_SID || verifiedAccounts.length),
      authTokenConfigured: Boolean(input.env.TWILIO_AUTH_TOKEN || verifiedAccounts.length),
      fromNumberConfigured: Boolean(
        input.env.TWILIO_FROM_NUMBER ||
          input.env.TWILIO_MESSAGING_SERVICE_SID ||
          verifiedNumbers.length
      ),
      configured: twilioConfigured,
      source: storedTwilioConfigured
        ? "encrypted_database"
        : envTwilioConfigured
          ? "environment"
          : legacyMetadataPresent
            ? "legacy_metadata_unverified"
            : "unconfigured",
      accountSidRedacted: accountLast4
        ? `redacted_${accountLast4}`
        : input.providerCredential?.accountSidRedacted ?? null,
      fromNumberRedacted: numberLast4
        ? `redacted_${numberLast4}`
        : input.providerCredential?.fromNumberRedacted ?? null,
      verifiedAccountCount: verifiedAccounts.length,
      verifiedNumberCount: verifiedNumbers.length,
      legacyMetadataPresent
    },
    compliance: {
      complete: complianceProfileIsComplete(input.complianceProfile),
      a2pRegistrationStatus: input.complianceProfile?.a2pRegistrationStatus ?? A2pRegistrationStatus.NOT_STARTED
    },
    blockers
  };
}
