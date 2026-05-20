# Data Model

`prisma/schema.prisma` is the executable source of truth.

## Milestone 1 Foundation

SignalStack is multi-tenant from the first product milestone:

- `Organization` represents a customer workspace.
- `AppUser` represents the local app user record mapped from Clerk later.
- `Membership` connects users to organizations with a role and status.

Demo mode uses:

- Organization slug: `demo-signalstack`
- User: `owner@signalstack.example`
- Role: `OWNER`

Tenant rule: every tenant-scoped table must include `orgId` unless explicitly documented in `contracts/CONTRACT-DB.md`.

## Milestone 2 Contacts

Contacts now include profile, consent, and import metadata:

- `Contact` stores phone, optional identity fields, consent state, opt-in/out timestamps, source, notes, and `archivedAt`.
- `Tag`/`ContactTag` provide reusable labels.
- `ContactList`/`ContactListMember` provide static list membership.
- `Segment` stores saved segment definitions as JSON for later campaign targeting.
- `ContactImport` stores CSV import audit counts and row-scoped errors.

The API uses tenant-scoped repositories for contact reads and writes. Contact deletion is a soft archive.

## Milestone 3 Campaign Drafts

- `MessageTemplate` stores reusable SMS copy and parsed variable names.
- `Campaign` stores draft campaign copy and an optional template link.
- `CampaignRecipient` stores the selected contacts for a draft campaign.

Preflight reads contacts and returns compliance reasons. It does not create messages, queue jobs, or call providers.

## Milestone 4 Queue Jobs

`QueueJob` stores durable scheduled campaign jobs with idempotency keys. Scheduling creates a queued record after preflight. Cancelling marks queued jobs cancelled. Workers and provider sends remain gated future work.

## Milestone 5 Shared Inbox

- `Conversation` now tracks contact ownership, optional assignee, open/resolved state, last message time, assignment time, and resolution time.
- `Message` remains the tenant-scoped message ledger for demo inbound rows and future provider-backed sends.
- `InternalNote` stores private team notes authored by organization users.

STOP-class inbound keywords update local contact consent to `OPTED_OUT`. HELP is tracked without creating outbound provider activity.

## Milestone 6 Compliance Profile

`ComplianceProfile` stores one org-scoped go-live readiness record with business identity, messaging use case, opt-in description, policy URLs, and demo A2P registration status. It is consumed by the centralized messaging hard gate and does not enable live messaging by itself.

## Milestone 8 Usage and Billing

- `UsageEvent` stores local usage counts by event type for analytics and billing-safe metering.
- `BillingAccount` stores one org-scoped local billing status record with live billing disabled by default.

These records do not trigger Stripe or any live billing provider behavior.

## Post-MVP Webhook Foundations

`WebhookEvent` stores org-scoped raw provider webhook payloads with a unique idempotency key. It is used by Twilio inbound and status webhook foundations to preserve provider data without live external side effects.

## Post-MVP Status Transition Processing

Provider delivery state is stored on `Message` rows:

- `providerStatus`: latest normalized provider status string.
- `providerErrorCode`: latest provider error code when present.
- `deliveredAt`: set when a provider status reaches `delivered`.
- `failedAt`: set when a provider status reaches `failed` or `undelivered`.

## Post-MVP Provider Number Foundation

`ProviderPhoneNumber` stores org-scoped phone-number metadata for demo and future provider setup screens. It tracks phone number, provider, local status, capabilities, and default selection. These rows are not credentials and do not prove live provider ownership.

## Post-MVP Provider Credential Metadata Foundation

`ProviderCredential` stores org-scoped local provider readiness metadata. For Twilio it records redacted account SID/from-number fields, credential presence booleans through derived settings, a one-way auth-token fingerprint, and source metadata. It intentionally does not store raw auth tokens or validate credentials with Twilio.

## Post-MVP Provider Credential Rotation History

`ProviderCredentialRotation` stores org-scoped local history for provider credential metadata configuration, rotation, and deletion events. It records provider name, action, optional credential row ID, redacted account/from-number values, last-four hints, configured booleans, optional actor, and timestamp. API responses never expose raw auth tokens or token fingerprints, and these records do not trigger provider calls or live messaging.

## Post-MVP Live Readiness Audit Foundation

`LiveReadinessAuditEvent` stores org-scoped local audit entries for configuration changes that affect future go-live readiness. It records an action, subject type, optional subject ID, optional actor, metadata, and timestamp. It does not trigger external notifications or provider activity.
