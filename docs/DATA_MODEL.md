# Data Model

`prisma/schema.prisma` is the executable source of truth.

## Milestone 1 Foundation

SignalStack is multi-tenant from the first product milestone:

- `Organization` represents a customer workspace.
- `AppUser` represents the built-in local identity; an optional future OIDC adapter may map a verified
  external subject to the same record and membership model.
- `Membership` connects users to organizations with a role and status.

Demo mode uses:

- Organization slug: `demo-signalstack`
- User: `owner@signalstack.example`
- Role: `OWNER`

Tenant rule: every tenant-scoped table must include `orgId` unless explicitly documented in `contracts/CONTRACT-DB.md`.

## Standalone M2 — Database-Enforced Tenant Integrity

The M2 checkpoint established the database tenant boundary that every later model must preserve:

- At the M2 checkpoint, `lib/db/tenant-manifest.ts` listed 22 ordinary tenant tables and five
  identity/control tables, for 27 protected tables total. Every protected table had forced, fail-closed
  RLS, and runtime posture compared command/role/predicate fingerprints rather than accepting policy names
  or counts alone.
- Same-tenant composite keys and foreign keys cover live relations. The upgrade preflight aborts on
  invalid legacy rows while emitting only invariant labels/counts, never tenant IDs or PII.
- Historical issuer, author, actor, and typed audit-subject references are validated by insert/update
  triggers when deleting the referenced row must not erase history.
- `LocalCredential` and `AuthThrottle` remain installation-global. User-global password-reset
  `AuthToken` rows retain their explicit null-organization shape and use bounded control context.
- All 40 M2 migrations support a distinct table-owning credential that is non-superuser and non-BYPASSRLS
  through the explicit NOLOGIN `signalstack_owner` capability. Web and worker logins are NOINHERIT,
  non-owner roles; provisioning removes the owner capability and runtime posture rejects it.
- Control-plane purposes do not grant broad access. Command-specific tenant-root/global-user policies
  require exact org/user/email/token/slug evidence and give the control role no DELETE on those tables.
- Queue discovery is exposed only through an atomically installed, bounded security-definer claim
  function. It derives eligibility and lease time from the database, rejects null/out-of-range arguments,
  has no public execution ACL, and returns `(id, orgId)` for matching tenant processing.
- The static direct-Prisma inventory has no tenant migration-debt entries. New tenant-owned models must
  add `orgId`, join the manifest/RLS policy set, use the transaction context, and extend the mandatory
  two-tenant matrix in the same change.

## Standalone M3 — Public Integration Substrate

The current 43-migration schema extends the M2 boundary to 31 ordinary tenant tables plus the five
identity/control tables, for 36 protected tables. The nine added tenant models are covered by forced RLS,
same-tenant composite relations, runtime posture attestation, least-privileged grants, and the mandatory
PostgreSQL tenant matrix:

- `ApiCredential` stores a visible unique prefix, server-keyed secret digest, scopes, expiry/revocation,
  last-use metadata, and a database-owned fixed rate window. Raw API keys are one-time responses and are
  never persisted in plaintext.
- `ApiIdempotencyRecord` binds a credential and HMAC-protected idempotency key to one method, canonical
  route, and request digest. The completed response snapshot is authenticated-encrypted before the JSON
  column is written, permitting an exact status/body/request-ID replay without storing a one-time secret
  in plaintext.
- `IntegrationAuditEvent` is append-only tenant evidence for API-key and public-integration lifecycle
  actions. Optional credential references are same-tenant and restricted rather than cascading history.
- `CustomerWebhookEndpoint` and `CustomerWebhookSubscription` store one immutable canonical HTTPS target,
  endpoint state/failure evidence, and an allowlisted event-type selection.
- `CustomerWebhookSigningSecret` stores versioned AES-256-GCM envelope fields and a safe fingerprint. Raw
  `whsec_` material is revealed only on creation/rotation; deliveries retain the precise secret version
  to which they were pinned.
- `CustomerWebhookEvent` is an immutable, deduplicated domain-event outbox row containing canonical raw
  payload text plus its digest. `CustomerWebhookDelivery` records endpoint/subscription/event/secret pins,
  bounded scheduling, generation/lease ownership, terminal evidence, and replay ancestry.
- `CustomerWebhookDeliveryAttempt` is reserved durably before network I/O, then completed once with its
  outcome. Its delivery/generation/attempt identity and timing are immutable, completed evidence cannot be
  rewritten, and an expired disabled-endpoint reservation is reconciled as ambiguous instead of erasing
  possible external impact. It retains acknowledgement/error classification and status code without storing
  response bodies.

`claim_due_customer_webhook_deliveries` is the worker-only bounded, database-timed claim seam. It uses
transactional row locking, lease/generation evidence, a fixed search path, and no `PUBLIC` execution grant;
network delivery occurs outside the transaction and finalization is conditional on the live owner token.

## Milestone 2 Contacts

Contacts now include profile, consent, and import metadata:

- `Contact` stores phone, optional identity fields, consent state, opt-in/out timestamps, source, notes, and `archivedAt`. Captured consent timestamp, method, and disclosure form an all-or-none, write-once bundle at both the application and database layers so concurrent writers cannot replace or combine separate evidence.
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

`QueueJob` stores durable scheduled campaign jobs with idempotency keys that are unique per organization and a monotonic generation for optional BullMQ mirroring. Scheduling creates or safely reopens a queued record after preflight but never resets a processing/completed row. Processing uses an expiring owner token that is renewed before provider calls and cleared on terminal transition, so an abandoned job is recoverable without letting an old owner finish it. Queue/campaign terminal state commits atomically. Cancellation and claiming serialize through the queued-row update: exactly one wins, and cancellation never reports success over active work. Workers and provider sends remain gated future work.

## Milestone 5 Shared Inbox

- `Conversation` now tracks contact ownership, optional assignee, open/resolved state, last message time, assignment time, and resolution time.
- `Message` remains the tenant-scoped message ledger for demo inbound rows and future provider-backed sends. Message idempotency keys are unique per organization so retry keys cannot collide across tenants.
- `InternalNote` stores private team notes authored by organization users.

STOP-class inbound keywords update local contact consent to `OPTED_OUT`. HELP is tracked without creating outbound provider activity.

## Milestone 6 Compliance Profile

`ComplianceProfile` stores one org-scoped go-live readiness record with business identity, messaging use case, opt-in description, policy URLs, and demo A2P registration status. It is consumed by the centralized messaging hard gate and does not enable live messaging by itself.

## Milestone 8 Usage and Billing

- `UsageEvent` stores local usage counts by event type for analytics and billing-safe metering.
- `BillingAccount` stores one org-scoped local billing status record with live billing disabled by default.

These records do not trigger Stripe or any live billing provider behavior.

## Post-MVP Webhook Foundations

`WebhookEvent` stores org-scoped raw provider webhook payloads with an idempotency key unique within that organization. Nullable `claimToken` and `claimExpiresAt` fields provide an atomic, expiring owner lease for unprocessed events: only one active claimant may run downstream work, only that owner may complete or release it, and an abandoned claim becomes recoverable after expiry. It is used by Twilio inbound and status webhook foundations to preserve provider data without live external side effects.

## Post-MVP Status Transition Processing

Provider delivery state is stored on `Message` rows:

- `providerStatus`: latest normalized provider status string.
- `providerErrorCode`: latest provider error code when present.
- `deliveredAt`: set when a provider status reaches `delivered`.
- `failedAt`: set when a provider status reaches the shared terminal-failure vocabulary: `failed`, `undelivered`, or `canceled`.

## Post-MVP Provider Number Foundation

`ProviderPhoneNumber` stores org-scoped phone-number metadata for demo and future provider setup screens. It tracks phone number, provider, local status, capabilities, and default selection. These rows are not credentials and do not prove live provider ownership.

## Post-MVP Provider Credential Metadata Foundation

`ProviderCredential` stores org-scoped local provider readiness metadata. For Twilio it records redacted account SID/from-number fields, credential presence booleans through derived settings, a one-way auth-token fingerprint, and source metadata. It intentionally does not store raw auth tokens or validate credentials with Twilio.

## Post-MVP Provider Credential Rotation History

`ProviderCredentialRotation` stores org-scoped local history for provider credential metadata configuration, rotation, and deletion events. It records provider name, action, optional credential row ID, redacted account/from-number values, last-four hints, configured booleans, optional actor, and timestamp. API responses never expose raw auth tokens or token fingerprints, and these records do not trigger provider calls or live messaging.

## Post-MVP Live Readiness Audit Foundation

`LiveReadinessAuditEvent` stores org-scoped local audit entries for configuration changes that affect future go-live readiness. It records an action, subject type, optional subject ID, optional actor, metadata, and timestamp. It does not trigger external notifications or provider activity.
