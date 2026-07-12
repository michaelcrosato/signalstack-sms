# Schema Changelog

## Milestone 0

- Added minimal validating Prisma schema for organization, user, membership, contact, campaign, conversation, and message stubs.

## Milestone 1

- Added organization, app user, membership, and deterministic demo org foundation.

## Milestone 2

- Added contact profile/consent fields, tags, lists, segments, and contact import audit records.

## Milestone 3

- Added message templates, campaign template links, and campaign recipients for draft/preflight workflows.

## Milestone 4

- Added queue job type/status enums and durable `QueueJob` records for scheduled campaign foundations.

## Milestone 5

- Added conversation assignment and lifecycle timestamps.
- Linked conversations to contacts and assignees.
- Added `InternalNote` for shared inbox team notes.
- Added message indexes for conversation/contact inbox reads.

## Milestone 6

- Added `A2pRegistrationStatus`.
- Added `ComplianceProfile` as a one-to-one org-scoped go-live readiness record.

## Milestone 8

- Added `UsageEventType` and `BillingAccountStatus`.
- Added `UsageEvent` for local usage metering.
- Added `BillingAccount` for org-scoped billing metadata with live billing disabled by default.

## Standalone M4 Provider Control Plane

- `20260712010000_provider_status_enums` adds the verified provider account/resource status vocabulary.
- `20260712011000_provider_ownership_substrate` adds `ProviderAccount`, `ProviderCredentialSecret`, and
  `ProviderMessagingService`; binds provider numbers to accounts; installs global keyed ownership and the
  exact web-only callback-routing capability; and joins the new rows to forced RLS/runtime grants.
- `20260712012000_provider_reverification_lifecycle` pins credential-generation and reverification state.
- `20260712013000_verified_provider_e164` separates verified canonical E.164 ownership from legacy metadata.
- `20260712014000_provider_phone_default_lifecycle` adds local account-bound default/disable invariants.
- `20260712015000_provider_credential_fingerprint` persists the safe authenticated credential fingerprint.
- `20260712016000_provider_resource_invariants` enforces strict capabilities and one-way verified resource
  identity transitions.
- `20260712017000_provider_legacy_promotion_identity` preserves row identity and creation evidence during
  the sole legacy CONFIGURED-to-VERIFIED ownership promotion.
- The current substrate is 51 migrations and 39 protected tables. M4 provider-control actions use append-
  only `IntegrationAuditEvent`; legacy `ProviderCredential`/`ProviderCredentialRotation` rows are preserved
  unverified/display-only and are not promoted to provider authority.

## Post-MVP Webhook Foundations

- Added `WebhookEvent` for org-scoped raw provider webhook payloads and idempotency tracking.

## Post-MVP Status Transition Processing

- Added `Message.providerStatus`, `Message.providerErrorCode`, `Message.deliveredAt`, and `Message.failedAt` for local delivery-status updates from provider callbacks.

## Legacy Provider Number Foundation

- Added `ProviderPhoneNumber` and `ProviderPhoneNumberStatus` for org-scoped local number metadata.

## Legacy Provider Credential Metadata Foundation

- Added `ProviderCredential` for org-scoped local provider readiness metadata.
- Twilio metadata stores redacted account/from-number values and one-way token fingerprints only.
- Credential metadata does not store raw auth tokens, call Twilio, verify ownership, enable live messaging,
  or send SMS. M4 preserves these rows as unverified/display-only and does not use them as authority.

## Legacy Provider Credential Rotation History

- Added `ProviderCredentialRotation` for org-scoped local history of provider credential metadata configuration, rotation, refresh, and deletion events.
- Rotation history stores redacted identifiers and configured booleans only; API responses do not expose raw
  tokens or token fingerprints. Canonical M4 provider-control audit evidence uses `IntegrationAuditEvent`.

## Post-MVP Live Readiness Audit Foundation

- Added `LiveReadinessAuditEvent` for org-scoped local go-live readiness audit events.

## Post-MVP Tenant-Scoped Idempotency

- Changed `QueueJob`, `Message`, and `WebhookEvent` idempotency uniqueness from global keys to tenant-scoped `(orgId, idempotencyKey)` keys.
- Repository upserts and webhook duplicate detection now include `orgId` in idempotency lookups.
