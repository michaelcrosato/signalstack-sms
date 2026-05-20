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

## Post-MVP Webhook Foundations

- Added `WebhookEvent` for org-scoped raw provider webhook payloads and idempotency tracking.

## Post-MVP Status Transition Processing

- Added `Message.providerStatus`, `Message.providerErrorCode`, `Message.deliveredAt`, and `Message.failedAt` for local delivery-status updates from provider callbacks.

## Post-MVP Provider Number Foundation

- Added `ProviderPhoneNumber` and `ProviderPhoneNumberStatus` for org-scoped local number metadata.

## Post-MVP Live Readiness Audit Foundation

- Added `LiveReadinessAuditEvent` for org-scoped local go-live readiness audit events.
