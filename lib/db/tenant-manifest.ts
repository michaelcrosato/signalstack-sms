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
  "ProviderPhoneNumber",
  "ProviderCredential",
  "ProviderCredentialRotation",
  "LiveReadinessAuditEvent",
  "WebhookEvent"
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

export const globalControlTables = Object.freeze([
  "LocalCredential",
  "AuthThrottle"
] as const);
