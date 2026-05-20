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
