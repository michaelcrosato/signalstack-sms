import type { DecryptedProviderCredential } from "@/lib/integrations/provider-accounts/credential-encryption";

export type MessagingProviderName = "dummy" | "twilio";

/** Compatibility input retained for existing dummy-only repositories and workers. */
export interface MessageSendInput {
  to: string;
  from: string;
  body: string;
  orgId: string;
  idempotencyKey: string;
}

/** Compatibility result retained for existing dummy-only repositories and workers. */
export interface MessageSendResult {
  providerMessageId: string;
  status: "queued" | "blocked";
}

export interface MessagingProvider {
  name: MessagingProviderName;
  send(input: MessageSendInput): Promise<MessageSendResult>;
}

export type ProviderCredentials = Readonly<{
  externalAccountId: string;
  token: DecryptedProviderCredential;
}>;

export type ProviderMessageStatus =
  | "accepted"
  | "scheduled"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "receiving"
  | "received"
  | "read"
  | "failed"
  | "undelivered"
  | "canceled"
  | "unknown";

export type ProviderNormalizedStatus = Readonly<{
  status: ProviderMessageStatus;
  providerStatus: string;
}>;

export type ProviderMessageCreateInput = Readonly<{
  orgId: string;
  to: string;
  from?: string;
  messagingServiceId?: string;
  body?: string;
  mediaUrls?: readonly string[];
  statusCallbackUrl?: string;
  idempotencyKey: string;
}>;

export type ProviderMessageCreateResult = Readonly<{
  providerMessageId: string;
  externalAccountId: string;
  status: ProviderNormalizedStatus;
  to: string;
  from: string | null;
  messagingServiceId: string | null;
  providerErrorCode: string | null;
}>;

export type ProviderMessageFetchInput = Readonly<{
  providerMessageId: string;
}>;

export type ProviderMessageRecord = ProviderMessageCreateResult &
  Readonly<{
    createdAt: string | null;
    sentAt: string | null;
  }>;

export type ProviderAccountRecord = Readonly<{
  externalAccountId: string;
  friendlyName: string | null;
  status: "active" | "suspended" | "closed" | "unknown";
}>;

export type ProviderPhoneNumberCapabilities = Readonly<{
  sms: boolean;
  mms: boolean;
}>;

export type ProviderPhoneNumberRecord = Readonly<{
  externalNumberId: string;
  externalAccountId: string;
  phoneNumber: string;
  friendlyName: string | null;
  capabilities: ProviderPhoneNumberCapabilities;
}>;

export type ProviderMessagingServiceRecord = Readonly<{
  externalServiceId: string;
  externalAccountId: string;
  friendlyName: string | null;
}>;

export type ProviderHealth = Readonly<{
  healthy: boolean;
  checkedAt: string;
  safeCode: "PROVIDER_HEALTHY" | "PROVIDER_CREDENTIALS_INVALID" | "PROVIDER_UNAVAILABLE";
}>;

export type ProviderOperation =
  | "create_message"
  | "fetch_message"
  | "verify_account"
  | "discover_phone_numbers"
  | "discover_messaging_services"
  | "health";

export type ProviderErrorDisposition = "terminal" | "retryable" | "ambiguous";

export type ProviderErrorClassification = Readonly<{
  disposition: ProviderErrorDisposition;
  retryable: boolean;
  safeCode: string;
  providerCode: string | null;
}>;

export type ProviderSignatureValidationInput = Readonly<{
  signature: string | null | undefined;
  url: string;
  params: Readonly<Record<string, string>>;
}>;

export interface ProviderAdapter extends MessagingProvider {
  readonly name: MessagingProviderName;
  readonly externalAccountId: string;
  createMessage(input: ProviderMessageCreateInput): Promise<ProviderMessageCreateResult>;
  fetchMessage(input: ProviderMessageFetchInput): Promise<ProviderMessageRecord>;
  normalizeStatus(status: string | null | undefined): ProviderNormalizedStatus;
  classifyError(error: unknown, operation: ProviderOperation): ProviderErrorClassification;
  validateSignature(input: ProviderSignatureValidationInput): boolean;
  verifyAccount(): Promise<ProviderAccountRecord>;
  discoverPhoneNumbers(): Promise<readonly ProviderPhoneNumberRecord[]>;
  discoverMessagingServices(): Promise<readonly ProviderMessagingServiceRecord[]>;
  getHealth(): Promise<ProviderHealth>;
}
