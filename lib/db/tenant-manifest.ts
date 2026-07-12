/**
 * Canonical database tenant-boundary manifest. Keep this list aligned with the fail-closed RLS
 * migration and the static/catalog gates. Tables intentionally omitted are global identity/control
 * state (`LocalCredential`, `AuthThrottle`) or Prisma's migration ledger.
 */
export const ordinaryTenantTables = Object.freeze([
  "Contact",
  "Tag",
  "ContactTag",
  "ContactList",
  "ContactListMember",
  "Segment",
  "MessageTemplate",
  "ContactImport",
  "Campaign",
  "CampaignRecipient",
  "Conversation",
  "QueueJob",
  "Message",
  "InternalNote",
  "ComplianceProfile",
  "UsageEvent",
  "BillingAccount",
  "ProviderAccount",
  "ProviderCredentialSecret",
  "ProviderMessagingService",
  "ProviderPhoneNumber",
  "ProviderCredential",
  "ProviderCredentialRotation",
  "LiveReadinessAuditEvent",
  "WebhookEvent",
  "ApiCredential",
  "ApiIdempotencyRecord",
  "IntegrationAuditEvent",
  "CustomerWebhookEndpoint",
  "CustomerWebhookSubscription",
  "CustomerWebhookSigningSecret",
  "CustomerWebhookEvent",
  "CustomerWebhookDelivery",
  "CustomerWebhookDeliveryAttempt"
] as const);

export const specialTenantTables = Object.freeze([
  "Organization",
  "Membership",
  "AppUser",
  "AuthSession",
  "AuthToken"
] as const);

export const protectedTenantTables = Object.freeze([
  ...ordinaryTenantTables,
  ...specialTenantTables
] as const);

/** Tenant rows whose application capability may insert/read but never rewrite or hard-delete. */
export const appendOnlyTenantTables = Object.freeze([
  "IntegrationAuditEvent",
  "CustomerWebhookEvent",
  "CustomerWebhookDeliveryAttempt"
] as const);

/** Durable M3 control/event rows are revoked or disabled, never hard-deleted by application code. */
export const nonDeletableTenantTables = Object.freeze([
  "ProviderAccount",
  "ProviderCredentialSecret",
  "ProviderMessagingService",
  "ProviderPhoneNumber",
  "ApiCredential",
  "IntegrationAuditEvent",
  "CustomerWebhookEndpoint",
  "CustomerWebhookSubscription",
  "CustomerWebhookSigningSecret",
  "CustomerWebhookEvent",
  "CustomerWebhookDelivery",
  "CustomerWebhookDeliveryAttempt"
] as const);

export const globalControlTables = Object.freeze([
  "LocalCredential",
  "AuthThrottle"
] as const);
