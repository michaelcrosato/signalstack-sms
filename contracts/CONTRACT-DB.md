# Database Contract

Owner: backend-data.

## Tenant Rule

Every tenant-scoped model must include `orgId` unless explicitly documented here. Repositories and route handlers must resolve the current organization before reading or writing tenant data.

## Standalone M2 Database Boundary

PostgreSQL independently enforces the tenant rule; repository predicates are defense in depth, not the
authorization boundary:

- The M2 baseline contained 22 ordinary tenant tables. M3 adds nine public-integration tables and M4 adds
  three provider-control tables, so the canonical manifest contains 34 ordinary tenant tables plus five
  identity/control tables (`Organization`, `Membership`, `AppUser`, `AuthSession`, and `AuthToken`). All 39 enable and force RLS,
  deny missing context, and expose no `PUBLIC` read/write privilege. Runtime posture verifies the exact
  tenant policy name, command, role, permissiveness, `USING`, and `WITH CHECK` expression for every table;
  a catalog with the right policy count but weakened semantics is rejected.
- Same-tenant composite foreign keys protect live relations. The upgrade runs a PII-free preflight that
  reports only invariant names/counts and aborts before constraints are added. Historical actor/subject
  references use insert/update validation triggers where parent deletion must preserve audit history.
  Operators must stage and schedule these relation/policy migrations in a maintenance window for large
  existing installations because constraint/index construction and policy changes can hold table locks.
- `LocalCredential` and `AuthThrottle` are installation-global control tables. A `PASSWORD_RESET`
  `AuthToken` is user-global by its documented null-organization shape; all other protected special-table
  access requires the matching bounded control evidence.
- Control purposes are routing labels, not authority. Command-specific policies on `Organization`,
  `Membership`, and `AppUser` require the exact applicable organization ID/slug, user ID, email, subject,
  or token evidence. Those three control paths expose SELECT/INSERT/UPDATE only and have no control-role
  DELETE grant or policy.
- `MIGRATION_DATABASE_URL` is the distinct table-owning migration/operator credential. The NOLOGIN,
  NOSUPERUSER, NOBYPASSRLS `signalstack_owner` capability supplies explicit forced-RLS access, so the
  table owner need not be a superuser or use BYPASSRLS. Web and worker `DATABASE_URL` values identify
  separately provisioned LOGIN NOINHERIT roles. Runtime provisioning revokes `signalstack_owner`, and
  runtime posture rejects owner membership as well as table ownership, superuser, or BYPASSRLS. Running
  processes never receive the migration credential.
- Tenant repository work runs in `withTenantTransaction`; identity/bootstrap/session work runs in
  `withAuthDatabaseContext`; global queue discovery runs in `withWorkerDispatchTransaction`. Each selects
  one fixed role and writes every context setting with transaction-local scope so pooled connections
  cannot retain authorization state.
- Due jobs are claimed only through the bounded `claim_due_queue_jobs` security-definer function. Its
  create/replace, ownership, ACL revocation, and worker-only EXECUTE grant are one atomic migration. It
  uses `clock_timestamp()` for eligibility/lease state, bounds caller time to 60 seconds of the database,
  rejects null or out-of-range limits/leases/tokens, fixes its search path, and exposes no `PUBLIC` or
  ordinary table access.
- API credentials are tenant rows containing a visible prefix, one-way keyed secret hash, allowlisted
  scopes, expiry/revocation/use metadata, and database-authoritative fixed-window counters. Pre-tenant
  lookup is SELECT-only through an exact `app.current_api_key_hash` control policy; all mutation occurs
  after entering the credential organization through the ordinary tenant role.
- The M3 ordinary-table inventory is `ApiCredential`, `ApiIdempotencyRecord`,
  `IntegrationAuditEvent`, `CustomerWebhookEndpoint`, `CustomerWebhookSubscription`,
  `CustomerWebhookSigningSecret`, `CustomerWebhookEvent`, `CustomerWebhookDelivery`, and
  `CustomerWebhookDeliveryAttempt`.
- API replay records are unique per `(orgId, credentialId, key)` and pin request/response hashes and
  expiry. Integration audit rows are append-only. Customer webhook endpoints, subscriptions, encrypted
  signing-secret versions, canonical event payloads, delivery leases/replay lineage, and durably reserved,
  one-way-completed attempts use composite same-tenant references. The only active secret per subscription is enforced by
  a partial unique index. Global delivery discovery is available only through the bounded,
  database-timed `claim_due_customer_webhook_deliveries` security-definer function, with EXECUTE granted
  only to `signalstack_worker` and no worker table privileges.
- The direct-Prisma inventory permits reviewed control-plane/context seams only. M2 closes with zero
  `tenant-migration-debt` imports; new tenant paths must use the transaction boundary and join its tests.

Mandatory proof covers tenant A and B across all 39 protected tables, missing context, cross-tenant
read/write/relation forgery, rollback, command-specific control policy denial, runtime policy semantic
fingerprints, worker dispatch, multi-connection pool reuse, and the literal non-owner external-network
lifecycle. `npm run test:tenant-db` is the current 14-file / 57-test gate (13 files / 56 tests in the tenant
batch plus one literal-network public-API file / one test); the complete database-directory
run remains mandatory without freezing a stale aggregate count here. The least-privilege test creates a fresh
database, applies all 51 migrations through a
non-superuser/non-BYPASSRLS table owner, exercises historical triggers and dispatch, and proves the
dispatch function has no `PUBLIC` EXECUTE ACL. Production local-auth browser proof uses separate
owner/runtime credentials and serves the app under the non-owner login.

## Milestone 1 Foundation

Canonical organization/auth models:

- `Organization`: `id`, unique `slug`, optional unique `clerkOrgId`, `name`, `demoMode`, `timezone`.
- `AppUser`: `id`, optional unique legacy `clerkUserId`, unique `email` and `normalizedEmail`, optional
  `displayName`, `emailVerifiedAt`, `disabledAt`, and an incrementing `authVersion` used to revoke stale
  sessions after credential/security changes.
- `Membership`: unique `(orgId, userId)`, `role`, `status`.
- `LocalCredential`: global (not tenant-scoped), unique per user, with a versioned memory-hard password
  hash, password-change timestamp, bounded failed-attempt count, and optional lock expiry. Raw passwords
  are never stored.
- `AuthSession`: organization-scoped selected-membership session with a globally unique,
  `AUTH_SESSION_SECRET`-keyed HMAC lookup hash of a random bearer token, user/org/auth-version links,
  idle/absolute expiry, last-seen time, and revocation time.
  Raw session tokens are returned only at creation and never persisted.
- `AuthToken`: globally unique hashed single-use bearer. `INVITE` rows are organization scoped and
  carry intended email/role plus a non-null issuer. `PASSWORD_RESET` rows are platform-operator-issued,
  user-global, and must have non-null `userId` with `orgId`, `email`, `role`, and `issuedByUserId` all
  null. Both shapes record expiry, consumption, and revocation; plaintext bearers are never stored.
- `AuthThrottle`: global (not tenant-scoped) hashed identity/network throttle state, unique by
  `(scope, keyHash)`, with bounded window/attempt/block metadata.

Canonical roles:

- `OWNER`
- `ADMIN`
- `MEMBER`

Canonical membership statuses:

- `ACTIVE`
- `INVITED`
- `SUSPENDED`

Explicit demo mode may use a deterministic local owner and organization. The standalone production
profile uses built-in credentials and opaque sessions; optional external identity is an adapter and is
not required for core operation.

Baseline tenant-scoped product models remain: `Contact`, `Campaign`, `Conversation`, `Message`.

## Milestone 2 Contacts Foundation

Canonical contact fields:

- `Contact`: tenant-scoped by `orgId`, unique `(orgId, phone)`, optional `email`, `firstName`, `lastName`, `displayName`, `source`, `notes`, and soft-delete `archivedAt`.
- Consent fields: `consentStatus`, `optInSource`, `optInAt`, `optedOutAt`.
- Evidence fields `consentCapturedAt`, `consentMethod`, and `consentDisclosure` form an all-or-none bundle and are write-once after first capture. Application checks provide friendly errors; a database completeness constraint and update trigger close partial, direct-writer, and concurrent read/write races.
- `Tag` and `ContactTag`: org-scoped reusable labels with unique `(orgId, name)`.
- `ContactList` and `ContactListMember`: org-scoped static lists with unique `(orgId, name)`.
- `Segment`: org-scoped saved segment definition stored as JSON.
- `ContactImport`: org-scoped CSV import audit record with status, row counts, and row-scoped errors.

Contacts are never hard-deleted by the API in Milestone 2. `DELETE /api/contacts/:contactId` sets `archivedAt`.

## Milestone 3 Campaign Draft Foundation

- `MessageTemplate`: tenant-scoped reusable SMS body with JSON `variables`, unique `(orgId, name)`.
- `Campaign`: tenant-scoped draft campaign with optional `templateId`; a referenced template must
  belong to the same organization, and tenant-scoped campaign reads must not expose a foreign
  template even if legacy data is malformed. Milestone 3 supports draft create/update only.
- `CampaignRecipient`: tenant-scoped join between draft campaign and contact, unique `(campaignId, contactId)`.

Campaign recipients are selected only from contacts in the current organization. Campaign reads and workers scope nested recipient/contact and message/contact relations by `orgId` so malformed legacy foreign-key links cannot expose or process another tenant's PII.

## Milestone 4 Queue Foundation

- `QueueJob`: tenant-scoped durable job record with tenant-unique `(orgId, idempotencyKey)`, JSON `payload`, `runAt`, status, and nullable processing owner/expiry fields. Only the current owner token may renew or finish `PROCESSING`; an expired lease is recoverable.
- Scheduled campaign jobs link to `Campaign` when applicable.

## Milestone 5 Shared Inbox Foundation

- `Conversation`: tenant-scoped inbox thread with optional `contactId`, optional `assignedToUserId`, `status`, `lastMessageAt`, `assignedAt`, and `resolvedAt`.
- `Message`: tenant-scoped message rows linked to a conversation/contact when available, with tenant-unique `(orgId, idempotencyKey)` for provider/worker retries. The isolated live-test SMS path must atomically reserve this row and a linked `LIVE_TEST_SMS_RESERVED` audit before its external provider call, then persist a definitive success or failure while leaving ambiguous outcomes pending. The audit holds only an HMAC-SHA-256 actor/recipient/body binding keyed by the server-side operator secret, recipient/from last-four, and body length so authorized duplicate keys can be validated without another provider call or an offline raw-request PII oracle. It never stores the operator token. Milestone 5 demo inbound rows use `direction: "INBOUND"` and never call a provider.
- `InternalNote`: tenant-scoped note linked to a conversation and author user.

Conversation assignment is limited to active members of the current organization. Resolve/reopen changes only local conversation state.

## Milestone 6 Compliance Profile Foundation

- `ComplianceProfile`: one org-scoped record with business identity, messaging use case, opt-in description, policy URLs, and `a2pRegistrationStatus`.
- `A2pRegistrationStatus`: `NOT_STARTED`, `PENDING`, `APPROVED`, `REJECTED`.

Compliance profile completion is required by the centralized messaging hard gate but does not enable live messaging by itself.

## Milestone 8 Usage and Billing Foundation

- `UsageEvent`: tenant-scoped local usage record with `type`, `quantity`, optional JSON metadata, and timestamp.
- `BillingAccount`: one org-scoped billing metadata record with local status and live-billing flag.
- `WebhookEvent`: org-scoped raw provider webhook record with provider, event type, tenant-unique `(orgId, idempotencyKey)`, raw payload, received timestamp, processed timestamp, and nullable claim owner/expiry fields. A null processed timestamp is retryable only after an atomic tenant-scoped lease claim; only the matching owner may complete or release the claim, and an expired lease is recoverable.
- `ProviderAccount` (M4): org-scoped provider identity with exact `externalAccountId`, globally unique keyed
  account lookup hash, safe display metadata, verification/health/generation state, and revocation evidence.
- `ProviderCredentialSecret` (M4): org/account-scoped versioned AES-256-GCM Auth Token envelope with one
  active version per account and retirement/revocation evidence.
- `ProviderPhoneNumber`: org/account-scoped number. Dummy/local rows remain metadata; M4 live rows require
  verified discovery/import, global `(provider, phoneNumber)` ownership, provider capability evidence, and
  disable/default state.
- `ProviderMessagingService` (M4): org/account-scoped verified service with globally unique keyed external
  identifier, capabilities, and disable/default state.
- `ProviderCredentialRotation`: preserved unverified/display-only legacy history for pre-M4 metadata
  configuration, rotation, and deletion; it is not M4 ownership or authorization evidence.
- `IntegrationAuditEvent`: canonical append-only M4 provider-control evidence for configuration,
  verification, rotation, revocation, health, discovery, import, default, and disable actions.
- `LiveReadinessAuditEvent`: org-scoped audit event for go-live readiness configuration changes.
- `UsageEventType`: `CONTACT_IMPORTED`, `MESSAGE_INBOUND`, `CAMPAIGN_SCHEDULED`, `AI_REQUEST`.
- `BillingAccountStatus`: `DEMO`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`.

Billing records are local metadata only. Stripe/customer/subscription IDs are nullable placeholders and must not be created by MVP endpoints.

## M4 Provider Accounts, Credentials, and Ownership

Provider records are ordinary tenant rows and must join the canonical manifest, forced RLS/runtime posture,
least-privilege grants, same-tenant composite relations, static Prisma inventory, and mandatory two-tenant
matrix. Pre-tenant callback routing is a separate exact SELECT-only capability keyed by account and
destination hashes; it exposes no broad provider-table reads or mutation.

Global invariants are:

- unique `(provider, accountIdentifierHash)` account ownership;
- unique active live `(provider, phoneNumber)` ownership;
- unique `(provider, messagingServiceIdentifierHash)` service ownership;
- one active credential version per account;
- same-tenant account/credential/number/service foreign keys plus organization-bound, secret-free audit
  subjects; and
- no default sender/service pointing to an unverified, disabled, or foreign-account resource.

A PII-free migration preflight emits only invariant labels/counts and aborts on legacy collisions. Existing
metadata-only credentials and caller-configured Twilio numbers remain explicitly unverified; migration cannot
promote them to owned/verified state because no recoverable secret or provider proof exists.

Credential envelopes store version, algorithm, key version, canonical IV/ciphertext/tag, and a safe keyed
fingerprint. AES-256-GCM AAD binds the tenant, provider, account, exact `externalAccountId`, account lookup
hash, credential-secret row/version, and fingerprint. The Twilio Auth Token and master key never enter
plaintext database columns. Account SID is a non-secret identifier stored only as tenant-scoped
`externalAccountId`; APIs/logs/audit/exports expose only redacted/last-four metadata. Ciphertext/tag/binding/
version tampering fails closed.

Credential rotation verifies outside the transaction, then locks and rechecks account generation before
creating/activating the next version and retiring the previous one. Revocation clears active authority and
disables readiness without hard deletion. Provider-control history is append-only and secret-free.

Verified discovery returns no persistent ownership. Import locks and rechecks the active verified account,
credential generation, and selected fresh discovery evidence before installing globally unique ownership.
Concurrent crossed/stale/duplicate imports roll back completely. Import never purchases, releases, ports, or
changes the provider-side resource.

## Post-MVP Live Readiness Audit Foundation

`LiveReadinessAuditEvent` records local configuration changes that affect future go-live readiness, such as compliance profile updates and provider number metadata changes. Audit records are local-only and must not trigger notifications, provider calls, billing events, or live messaging.
