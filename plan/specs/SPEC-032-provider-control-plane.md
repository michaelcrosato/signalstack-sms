# SPEC-032 — Provider Control Plane and Trusted Callback Routing

- **Status:** Done (2026-07-12)
- **Priority:** P0
- **Roadmap:** M4 in `docs/STANDALONE_ROADMAP.md`
- **External services:** operator-invoked Twilio verification/discovery only; tests use fixtures

## Goal

Give each organization recoverable, encrypted provider credentials; verified provider accounts, numbers,
and messaging services; a complete provider-adapter contract; and exact signed-callback tenant routing.
M4 establishes provider identity and ownership. It does not send, purchase, release, or port a number and
does not enable any general live messaging path.

## Safety boundary

- `dummy` remains the default provider and is deterministic and network-free.
- No M4 default, fixture, migration, seed, CI job, health check, or background worker contacts Twilio.
- A real Twilio read is allowed only from an explicit same-origin ADMIN verification, discovery, or health
  request using credentials supplied or already encrypted for that account. Real credentials and execution
  remain human-gated.
- M4 never calls the Messages create endpoint, purchases/releases a number, changes a provider-side
  messaging service, enables `LIVE_MESSAGING_ENABLED`, or starts a production live worker. M5 owns durable
  outbound provider mutation; M6 owns the complete production inbound/status workflow.
- The isolated `/api/demo/live-test-sms` exception remains environment-credential-only and does not consume
  the M4 credential store.

## Canonical provider records

The canonical M4 schema separates provider identity, credential versions, and owned senders:

- `ProviderAccount` is tenant scoped and stores provider name, exact provider `externalAccountId`, a global
  keyed lookup hash, safe last-four/display metadata, verification/health/status timestamps, and revocation
  state. Twilio Account SID is an identifier, not an authentication secret; safe DTOs still redact it.
- `ProviderCredentialSecret` is tenant/account scoped and stores one versioned authenticated-encryption
  envelope, a safe credential fingerprint, activation/retirement/revocation timestamps, and no plaintext.
- `ProviderPhoneNumber` belongs to one same-tenant provider account. A live imported row stores canonical
  E.164, provider number identifier/hash when available, verified capabilities, import/verification state,
  and disable/default evidence.
- `ProviderMessagingService` belongs to one same-tenant provider account and stores a globally unique keyed
  external-identifier hash, safe last-four/display metadata, verified capabilities, and disable/default
  evidence.
- `IntegrationAuditEvent` is the canonical append-only M4 provider-control evidence for configure, verify,
  rotate, revoke, health, discovery, import, default, and disable actions.

Existing metadata-only `ProviderCredential`, `ProviderCredentialRotation`, and manually configured Twilio-
number rows are preserved as unverified/display-only legacy evidence and are never promoted to verified
ownership during migration. New M4 operations write `IntegrationAuditEvent`; they do not treat legacy
rotation rows as authority. An ADMIN must re-enter a credential and provider verification/discovery must
prove the account and resource before verified ownership exists.

Database invariants:

- `(provider, accountIdentifierHash)` is globally unique.
- Active live `(provider, phoneNumber)` ownership is globally unique across organizations.
- `(provider, messagingServiceIdentifierHash)` is globally unique.
- Every account/credential/number/service relation includes `orgId` in its key and foreign key; canonical
  provider-control audit rows carry the same organization and safe local subject identifiers.
- At most one active credential version exists per account. Default sender/service constraints serialize
  concurrent changes and cannot select an unverified, disabled, or foreign-account resource.
- A PII-free preflight reports only invariant labels/counts and aborts on legacy collisions before global
  ownership or same-tenant constraints are installed.
- Every new tenant row joins the protected-table manifest, forced RLS policies, runtime posture
  fingerprints, least-privilege grants, static Prisma inventory, and mandatory two-tenant PostgreSQL gate.
- Provider-control audit/rotation rows are immutable after insertion. Credential/account/ownership history
  is revoked or disabled, never hard-deleted by application code.

## Provider credential envelope

Provider credential plaintext is the strictly validated provider authentication secret. Twilio v1 contains
only the Auth Token. The Account SID is the account's exact `externalAccountId` and participates in binding,
but is not ciphertext. The Auth Token is encrypted with AES-256-GCM:

- envelope version: `1`
- algorithm: `aes-256-gcm`
- IV: 12 fresh random bytes
- authentication tag: 16 bytes
- key version: positive 32-bit integer
- master key: the separately provisioned 32-byte `SECRETS_MASTER_KEY`
- derived key context: `signalstack/provider-credential-envelope-key/v1`
- AAD context: `signalstack/provider-credential-envelope`, envelope/key versions, `orgId`, provider, exact
  `externalAccountId`, its canonical keyed `externalAccountIdHash`, local `providerAccountId`, credential-
  secret ID/version, and safe credential fingerprint

The raw master key is read only at an operation boundary. Imports never read environment secrets. A
domain-separated HMAC derivation keeps provider envelopes independent from M3 webhook-secret and
idempotency encryption. Ciphertext, IV, tag, fingerprint, or binding tampering; an unsupported version;
or a wrong master key returns one generic internal credential-unavailable error without a decryption oracle.

The safe credential fingerprint and account/service lookup hashes are domain-separated, master-keyed
HMACs, not raw SHA-256 hashes. They identify versions/routes but cannot authenticate a provider request.
The Auth Token never enters plaintext database columns, later reads, response bodies, HTML, page props,
caches, logs, traces, metrics, audit metadata, CSV, errors, or exception causes. The exact Account SID may
exist only in the tenant-scoped account row and operation memory; safe DTOs/logs/audit/exports expose a
redacted value or last-four, never the full identifier. The browser may
hold operator-entered values only in an unprefilled password/form control for the active submission; the
form resets on completion and the server never returns either value.

## Credential and account lifecycle

All control-plane mutations require a verified browser session, current organization, at least ADMIN, and
the shared same-origin boundary before body parsing.

Account creation:

1. Strictly validate `AC` plus 32 hexadecimal characters and a bounded nonblank token.
2. Use the submitted values only in memory to perform a bounded provider account verification.
3. Require the verified provider account identifier to exactly equal the submitted identifier.
4. In one tenant transaction, recheck global ownership, create the account and encrypted credential
   version, activate it, append secret-free audit evidence, and expose only a safe DTO.
5. A timeout, authentication denial, provider error, malformed/mismatched response, ownership conflict,
   encryption failure, or database failure commits none of the account/credential/ownership rows.

Rotation verifies the replacement token against the immutable account identifier before a transaction
locks the account, creates the next encrypted version, retires the prior active version, updates readiness,
and appends audit evidence. A verification raced by another rotation/revocation must recheck the locked
generation and fail with `409` rather than activate stale evidence. Revocation immediately removes active
credential authority and disables provider readiness without erasing any version or audit history.

Health checks are explicit, bounded, read-only provider calls. A result records safe status/time/error-class
evidence but never raw provider response text. Health failure does not silently revoke a credential or
change global ownership.

## Verified discovery, import, and ownership

Discovery uses the account's current active credential and the provider adapter to list numbers and
messaging services without mutation. Results are strictly parsed and returned as bounded safe candidates:
canonical provider ID last-four, E.164 number when applicable, capabilities, and provider status only.

Import accepts only identifiers from a fresh discovery result bound to the account and credential
generation. The transaction locks the account, rechecks ACTIVE/VERIFIED state and generation, validates the
selected result again, enforces global ownership, and appends audit evidence. A stale discovery, duplicate
global owner, crossed account, malformed capability, or concurrent import fails atomically. Import never
purchases, releases, ports, configures, or mutates the provider-side resource.

Discovery candidate IDs use the separate `pvcandidate_v1_` HMAC domain and bind organization, account,
credential generation, resource kind, and exact discovered value. They are opaque browser round-trip
evidence only. Canonical `pvlookup_v1_` ownership/routing hashes are derived independently during import and
never enter a safe DTO, page prop, or response.

Twilio messaging service IDs are exactly `MG` plus 32 hexadecimal characters. Phone numbers use canonical
E.164. Verified capabilities use the allowlist `sms` and `mms`; arbitrary strings and caller-asserted live
capabilities are rejected.

## Provider factory contract

The provider factory selects only an allowlisted implementation (`dummy` or `twilio`) and exposes:

- account verification and health;
- number and messaging-service discovery;
- message creation and fetch types covering SMS/MMS body/media, exactly one owned sender number or
  messaging service, destination, callback URL, and correlation/idempotency evidence;
- provider message/status/error normalization;
- retry classification into definitive success, definitive failure, retryable-before-impact, and ambiguous
  after possible external impact;
- exact inbound/status signature validation using the account credential;
- normalized account, number, messaging-service, and capability identifiers.

Every network operation accepts an injected transport and bounded abort signal. Provider failures expose a
small secret-free domain vocabulary and never include raw provider response text, authorization headers, or
request URLs containing secrets. The M4 Twilio create/fetch contract is fixture-tested but no application
route or worker calls message creation. `dummy` implements the same interface deterministically with no
environment read, network access, time-dependent ID, or external side effect.

## ADMIN control-plane routes

These cookie-authenticated routes use the existing internal JSON style, `Cache-Control: no-store`, strict
Zod boundaries, ADMIN mutation authorization, and safe DTOs:

| Route | Meaning |
| --- | --- |
| `GET /api/settings/provider` | Aggregate safe provider readiness; no external call. |
| `GET|POST /api/settings/provider/accounts` | List safe accounts or verify/create one. |
| `GET|PATCH|DELETE /api/settings/provider/accounts/:accountId` | Read safe state, update local display/default metadata, or revoke locally. |
| `POST /api/settings/provider/accounts/:accountId/rotate` | Verify and activate a replacement credential version. |
| `POST /api/settings/provider/accounts/:accountId/verify` | Explicitly reverify account identity/readiness. |
| `POST /api/settings/provider/accounts/:accountId/health` | Explicit bounded provider health read. |
| `POST /api/settings/provider/accounts/:accountId/discover` | Discover bounded number/service candidates without persistence. |
| `POST /api/settings/provider/accounts/:accountId/import` | Import selected fresh discovery candidates without provider mutation. |
| `GET /api/settings/provider/accounts/:accountId/numbers` | List safe verified/disabled owned-number state. |
| `GET /api/settings/provider/accounts/:accountId/messaging-services` | List safe verified/disabled service state. |
| `PATCH /api/settings/numbers/:numberId` | Make a verified sender default or disable it locally. |
| `PATCH /api/settings/provider/accounts/:accountId/messaging-services/:serviceId` | Make a verified service default or disable it locally. |

The legacy `PATCH /api/settings/provider` method is retired with a no-store `410` before body parsing.
`DELETE /api/settings/provider` may delegate only to revocation of the selected default account under the
same rules; it may not hard-delete credential history. Existing `/api/settings/numbers` routes remain dummy/local metadata unless
they delegate to a verified account import. They may not accept caller-asserted Twilio ownership.

## Exact signed callback routing

Provider callbacks never use browser identity, API keys, demo fallback, or the installation-global
`TWILIO_AUTH_TOKEN` as tenant authority.

1. Parse one bounded URL-encoded, string-only form; reject duplicates/files before lookup.
2. Strictly normalize the untrusted Twilio `AccountSid` and event-specific owned destination:
   inbound uses `To`; outbound status uses `From`; `MessagingServiceSid` may additionally identify an
   imported same-account service.
3. Hash the normalized evidence with the domain-separated provider-routing key and perform one bounded,
   exact pre-tenant candidate lookup. The lookup is SELECT-only and exposes no broad provider-table access.
4. Require exactly one active verified account + owned number/service + active credential version. Decrypt
   only that credential and validate `X-Twilio-Signature` over the exact externally visible request URL and
   every form parameter.
5. Enter the resolved tenant transaction, lock and recheck account, ownership, and credential generation,
   then persist the raw event and run the existing lease/idempotency path.

Malformed payloads remain `400`. Wrong credential/signature, wrong destination, crossed account/resource,
unknown ownership, detected ambiguity, revoked/disabled state, or a rotation race all return the same
secret-free `403` body `{ "error": "Provider callback rejected.", "code": "INVALID_PROVIDER_CALLBACK" }`
with `Cache-Control: no-store`; none may create a `WebhookEvent`, contact, conversation, message, metric with
tenant identity, or audit row. Routing storage/crypto unavailability returns secret-free `503`
`WEBHOOK_ROUTING_UNAVAILABLE` and also performs no tenant mutation. Responses never reveal whether an
account, number, service, or credential exists.

## Audit, DTO, and observability rules

Safe provider DTOs may contain local IDs, provider name, labels, redacted/last-four identifiers, safe
fingerprints, status/capabilities, verification/health/import/revocation timestamps, and boolean readiness.
They may not contain ciphertext, IV, authentication tag, key version if it aids an oracle, lookup hashes,
raw credentials, authorization headers, raw provider errors, or another tenant's identifiers.

Audit/metrics use allowlisted action and error-class catalogs. Logs and traces pass through redaction and
must not serialize request bodies or ORM credential rows. Secret scanning includes provider input names,
envelope fields, Twilio fixtures, API/page snapshots, exports, and error paths.

## Rollout slices

1. Freeze this spec and provider/API/auth/DB/webhook/testing contracts.
2. Add crypto, schema, collision preflight, same-tenant/global ownership constraints, RLS, and DB proof.
3. Expand the provider factory and deterministic dummy; add fixture-only Twilio verification/discovery,
   normalization, retry classification, signature validation, create/fetch types, and health.
4. Add account/credential lifecycle and ADMIN safe DTO routes.
5. Add verified number/service discovery and import.
6. Replace demo/global-token callback routing with exact account + owned-destination resolution.
7. Run the two-account/two-number non-owner PostgreSQL routing proof plus HTTP route fixtures and update the
   M4 ledger. This milestone does not claim a literal end-to-end Next server for provider callbacks.

## Acceptance criteria

- [x] Credential plaintext is recoverable only through the bound AES-256-GCM envelope; tamper, wrong
  tenant/account/version/master key, and secret-output attempts fail closed.
- [x] Multiple verified accounts may belong to one organization, while account identifiers, active live
  numbers, and messaging services have globally unambiguous ownership.
- [x] Legacy metadata is not promoted to verified ownership; collision preflight and concurrent imports fail
  before partial state.
- [x] ADMIN verification, rotation, revocation, health, discovery, and import enforce auth/origin before body
  parsing, return safe DTOs, and append immutable secret-free audit evidence.
- [x] Twilio fixtures cover exact account verification, number/service discovery, capability parsing,
  bounded transport, malformed/error responses, health, and safe error/retry normalization.
- [x] The provider factory covers every frozen operation; dummy remains deterministic and no M4 application
  path calls message creation, purchases/releases a number, or changes provider state.
- [x] Signed callbacks resolve the exact tenant only after account + destination candidate resolution and
  per-account signature validation; tenant state/generation is rechecked under lock before persistence.
- [x] Wrong token, wrong/crossed destination, unknown/ambiguous ownership, disabled/revoked state, and
  rotation races share generic denial and create no event/domain/audit row.
- [x] Fresh least-privilege migration/no-diff, protected-table posture, two-tenant non-owner PostgreSQL
  routing plus HTTP route fixtures, secret scan, contracts, focused suites, and `npm run validate` pass
  without real carrier/provider calls.

## Exit criteria

Eight M4 migrations (`20260712010000` through `20260712017000`) extend the current database to 51 migrations
and 39 protected tables. Non-owner PostgreSQL fixtures configure two organizations with separate Twilio
accounts, credentials, numbers, and messaging services and prove exact signed routing, crossed/unknown
denial, credential-generation invalidation, revocation, and zero routing-failure persistence. HTTP route
fixtures separately prove the inbound/status handler boundary. Verification, discovery/import, rotation,
revocation, health, and the complete provider factory run through deterministic transports. The mandatory
tenant runner is 14 files/57 tests. No message is sent and no provider resource is purchased, released,
ported, configured, or otherwise mutated.
