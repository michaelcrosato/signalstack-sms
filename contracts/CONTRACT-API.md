# API Contract

Every internal cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` passes its concrete `Request`
through the shared authentication boundary. After session authentication and before role checks, body
parsing, or mutation, that boundary requires an exact Origin/Host match (using only proxy-overwritten
forwarding evidence when trusted). Auth public mutations enforce the same policy in their specialized
handlers; signed provider webhooks remain signature-authenticated exceptions.

Owner: backend-data and frontend-ui.

## Frozen `/api/v1` Public Integration Protocol (M3 Complete)

This section is the implemented compatibility contract for M3. The route inventory, OpenAPI document,
external-network test application/receiver, and customer-webhook worker are complete under the dummy/local
transport boundary. The detailed acceptance contract and evidence are in
`plan/specs/SPEC-031-public-integrations.md`.

Every `/api/v1` resource and mutation route authenticates only one exact
`Authorization: Bearer ss_api_<prefix>_<secret>` credential. Browser cookies, demo principals, provider
signatures, query-string keys, and alternate schemes are ignored. `GET /api/v1/openapi.json` is the one
unauthenticated metadata exception.

### Envelope, request ID, errors, pagination, idempotency, and rate limits

- Success is `{ "ok": true, "data": ..., "meta": { "requestId": "uuid", ... } }`.
- Failure is `{ "ok": false, "error": { "code": "...", "message": "...", "details": ...? },
  "meta": { "requestId": "uuid" } }`.
- Every response is `Cache-Control: no-store`; `X-Request-Id` exactly matches `meta.requestId`. A single valid
  client UUID may be retained; malformed or duplicated evidence is replaced.
- Stable public codes are `AUTHENTICATION_REQUIRED`, `INVALID_API_KEY`, `INSUFFICIENT_SCOPE`,
  `INVALID_REQUEST`, `INVALID_JSON`, `INVALID_CURSOR`, `IDEMPOTENCY_KEY_REQUIRED`,
  `IDEMPOTENCY_KEY_INVALID`, `IDEMPOTENCY_CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`,
  `VALIDATION_ERROR`, `OPERATION_NOT_ALLOWED`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`,
  `RATE_LIMIT_EXCEEDED`, `INTERNAL_ERROR`, `UPSTREAM_ERROR`, and `SERVICE_UNAVAILABLE` with the status mapping
  in SPEC-031. Unknown, expired, revoked, and rotated-away key states all use `INVALID_API_KEY`.
- Collections use a default limit of 50 and maximum 100, newest-first `(createdAt, id)` ordering, and a
  maximum-1,024-character HMAC-authenticated v1 cursor bound to the tenant and canonical resource. An invalid,
  tampered, foreign-tenant, or foreign-resource cursor returns `INVALID_CURSOR` without fallback.
- Every public `POST`, `PUT`, `PATCH`, and `DELETE` requires one `[A-Za-z0-9._:-]{8,128}`
  `Idempotency-Key`. The key, method, route, and canonical JSON body are bound inside the same PostgreSQL
  transaction as the domain mutation and encrypted completed response. Exact retries within 24 hours return
  the original status, body, and request ID with `Idempotency-Replayed: true`; changed bindings return
  `409 IDEMPOTENCY_CONFLICT`.
- PostgreSQL consumes the resolved key's one-minute window before scope evaluation or body parsing.
  Authenticated responses include `RateLimit-Limit`, `RateLimit-Remaining`, and Unix-seconds
  `RateLimit-Reset`; exhausted requests also include `Retry-After` and return `RATE_LIMIT_EXCEEDED`. Database
  failure returns `SERVICE_UNAVAILABLE`, never an in-memory or unmetered fallback.

### Scope catalog

The exact non-wildcard catalog is `organization:read`; `contacts:read|write`; `tags:read|write`;
`lists:read|write`; `segments:read|write`; `templates:read|write`; `messages:read|write|send`;
`campaigns:read|write|send`; `conversations:read|write`; `deliveries:read`; `credentials:read|write`; and
`webhooks:read|write|replay`. `messages:send` and `campaigns:send` are separate external-impact grants. A public
credential can read, rotate, or revoke only itself; tenant-wide creation and administration remain behind the
cookie-session ADMIN boundary.

### Frozen route table

The exact M3 routes and minimum scopes are:

- `GET /api/v1/openapi.json` — public metadata exception.
- `GET /api/v1/organization` — `organization:read`.
- `GET /api/v1/contacts`, `GET /api/v1/contacts/:contactId` — `contacts:read`.
- `POST /api/v1/contacts`, `PATCH /api/v1/contacts/:contactId`,
  `DELETE /api/v1/contacts/:contactId` — `contacts:write`.
- `GET /api/v1/tags`, `GET /api/v1/tags/:tagId` — `tags:read`.
- `POST /api/v1/tags`, `PATCH /api/v1/tags/:tagId`, `DELETE /api/v1/tags/:tagId` — `tags:write`.
- `GET /api/v1/lists`, `GET /api/v1/lists/:listId` — `lists:read`.
- `POST /api/v1/lists`, `PATCH /api/v1/lists/:listId`, `DELETE /api/v1/lists/:listId` — `lists:write`.
- `GET /api/v1/lists/:listId/contacts` — `lists:read` plus `contacts:read`.
- `POST /api/v1/lists/:listId/contacts`, `DELETE /api/v1/lists/:listId/contacts/:contactId` — `lists:write`.
- `GET /api/v1/segments`, `GET /api/v1/segments/:segmentId` — `segments:read`.
- `POST /api/v1/segments`, `PATCH /api/v1/segments/:segmentId`,
  `DELETE /api/v1/segments/:segmentId` — `segments:write`.
- `GET /api/v1/segments/:segmentId/contacts` — `segments:read` plus `contacts:read`.
- `GET /api/v1/templates`, `GET /api/v1/templates/:templateId` — `templates:read`.
- `POST /api/v1/templates`, `PATCH /api/v1/templates/:templateId`,
  `DELETE /api/v1/templates/:templateId` — `templates:write`.
- `GET /api/v1/messages`, `GET /api/v1/messages/:messageId` — `messages:read`.
- `POST /api/v1/messages` — `messages:send`; M3 remains dummy-only.
- `GET /api/v1/messages/:messageId/status` — `deliveries:read`.
- `GET /api/v1/campaigns`, `GET /api/v1/campaigns/:campaignId` — `campaigns:read`.
- `POST /api/v1/campaigns`, `PATCH /api/v1/campaigns/:campaignId` — `campaigns:write`.
- `POST /api/v1/campaigns/:campaignId/schedule`, `POST /api/v1/campaigns/:campaignId/cancel` —
  `campaigns:send`.
- `GET /api/v1/conversations`, `GET /api/v1/conversations/:conversationId` — `conversations:read`.
- `GET /api/v1/conversations/:conversationId/messages` — `conversations:read` plus `messages:read`.
- `POST /api/v1/conversations/:conversationId/messages` — `conversations:write` plus `messages:send`.
- `GET /api/v1/api-keys/current` — `credentials:read`; safe metadata for the calling key only.
- `POST /api/v1/api-keys/current/rotate`, `DELETE /api/v1/api-keys/current` — `credentials:write`; the calling
  key only.
- `GET /api/v1/webhook-event-types`, `GET /api/v1/webhook-endpoints`, and
  `GET /api/v1/webhook-endpoints/:endpointId` — `webhooks:read`.
- `POST /api/v1/webhook-endpoints`, `PATCH /api/v1/webhook-endpoints/:endpointId`,
  `DELETE /api/v1/webhook-endpoints/:endpointId`, and
  `POST /api/v1/webhook-endpoints/:endpointId/rotate-secret` — `webhooks:write`.
- `GET /api/v1/webhook-endpoints/:endpointId/deliveries` — `deliveries:read`.
- `POST /api/v1/webhook-deliveries/:deliveryId/replay` — `webhooks:replay`.

### `GET /api/settings/api-keys`

Lists safe API credential metadata for the current organization after cookie-session ADMIN authorization.
It never returns a raw key, stored hash, last-use network hash, or another tenant's row and is non-cacheable.

### `POST /api/settings/api-keys`

Creates one tenant API credential after cookie-session ADMIN and same-origin checks. It validates exact
catalog scopes, expiry, and the per-minute limit, then returns the raw bearer exactly once with safe metadata.

### `POST /api/settings/api-keys/:credentialId`

Rotates one same-tenant, unrevoked credential after ADMIN and same-origin checks. The previous bearer becomes
invalid atomically; the replacement is returned once and is never available from later reads.

### `DELETE /api/settings/api-keys/:credentialId`

Idempotently revokes one same-tenant credential after ADMIN and same-origin checks. It retains secret-free
metadata and audit evidence and never hard-deletes the credential.

## Implemented Endpoints

### `/setup`, `/login`, and `/logout`

Provide the self-hosted first-owner, built-in credential, and browser session-exit workflows. They use
the local auth endpoints below, never render server secrets, accept only local redirect destinations,
and do not substitute deterministic demo identity when local auth is selected.

### `POST /api/auth/setup`

Creates the first local owner, organization, active membership, and opaque session only when local auth
is selected, a server-only bootstrap token is configured and matched, and no local credential exists.
The response contains sanitized user/organization data, sets an HttpOnly session cookie, and is never
cacheable. Invalid, denied, closed, or unavailable setup attempts return stable secret-free errors.

### `POST /api/auth/login`

Authenticates a local email/password using a generic denial response, selects an active organization
membership, rotates the presented session, and sets a fresh opaque HttpOnly session cookie. It returns
only sanitized current-user, organization, role, and expiry metadata and is never cacheable.

### `POST /api/auth/logout`

Idempotently revokes the presented local session when one can be resolved and clears both supported
session-cookie forms. Missing or invalid session evidence does not make logout fail. The response is
secret-free and never cacheable.

### `GET /api/auth/session`

Resolves the opaque local session against current database user, organization, active membership,
revocation, auth-version, idle-expiry, and absolute-expiry state. Valid sessions return sanitized
identity and expiry metadata; every invalid state returns `401` without demo fallback. The response is
never cacheable.

### `POST /api/auth/sessions/revoke-all`

Revokes every opaque session for the authenticated user across organizations after MEMBER and same-
origin checks, increments the user's authentication generation, and clears both supported cookie names.
The route never accepts a user ID or bearer in its body and returns only a revoked-row count.

### `POST /api/auth/password-resets`

Authenticates the cookie session and then returns non-cacheable `403
PASSWORD_RESET_OPERATOR_REQUIRED` without parsing request JSON. No tenant role can issue a bearer that
changes a user-global credential. The supported issuance boundary is the zero-argument
`npm run admin:reset-link` operator command.

### `POST /api/auth/password-resets/complete`

Completes a built-in reset as a narrowly declared public-auth mutation. Local-mode and exact same-origin
checks precede a PostgreSQL `LOGIN_NETWORK` throttle, which is consumed before body parsing using trusted
proxy evidence only when configured and otherwise the documented `0.0.0.0` fallback. The strict body
contains only reset `token` and policy-valid `password`. One atomic claim of the platform-operator/global token shape replaces or creates the
credential, clears failures/lock, increments auth version, revokes all sessions, consumes the token once,
and writes null-actor secret-free audit evidence across the user's current memberships. Success returns only `{ "completed": true }`, clears both session
cookie names, and is non-cacheable. Malformed, expired, replayed, revoked, foreign, and mismatched reset
evidence use the same `400`; throttle denial uses `429` plus bounded `Retry-After`; throttle/storage/runtime
failure uses sanitized `503`. No response echoes token, password, email, hash, or account evidence.

### `GET /api/auth/organizations`

Lists only ACTIVE organization memberships for the enabled user resolved from the built-in local
session. Each item contains only organization `id`, `name`, `slug`, `timezone`, `demoMode`, and the
authenticated user's role. The endpoint never accepts a user identifier and all responses are
non-cacheable.

### `POST /api/auth/organizations`

Creates one non-demo organization, ACTIVE OWNER membership for the authenticated user, and secret-free
audit event in one transaction. Authentication and the current-session OWNER role gate run before
same-origin validation and body parsing. The strict body accepts only `name`, `slug`, and `timezone`;
caller-supplied user, role, or tenant relations are rejected. A successful response is `201`; duplicate
slugs return a sanitized `409`. The endpoint is available only with built-in local auth and every
response is non-cacheable.

### `POST /api/auth/organizations/select`

Switches the current opaque database session to an organization where its enabled user has an ACTIVE
membership. Authentication and the current-session MEMBER role gate run before same-origin validation
and body parsing. The strict body accepts only `organizationId`; user, role, and token fields are
rejected. The bearer is read only from the environment-appropriate HttpOnly session cookie, remains
opaque, and is not rotated because only the session row's selected organization changes. Cross-user,
suspended, disabled, malformed, and missing target states use sanitized errors. Every response is
non-cacheable.

### `GET /api/auth/team`

Returns sanitized same-tenant ACTIVE/SUSPENDED members and pending invitations after built-in local
authentication and an ADMIN role check. Member output contains identity, role, status, disabled flag, and
membership timestamps; invite output contains identity, intended role, issuer, and expiry metadata. No
credential hash, token hash, or raw bearer is returned. Every response is non-cacheable.

### `POST /api/auth/team/invites`

Creates one expiring, email-bound invitation after authentication, ADMIN authorization, local-mode, and
same-origin checks run before parsing. ADMIN can invite MEMBER/ADMIN; only OWNER can invite OWNER. Success
returns the sanitized invite plus a one-time `/invite#token=...` `acceptPath`. Only the hash is stored, and
the raw token is absent from later reads, logs, audit metadata, and errors. Duplicate pending invites or
existing memberships return sanitized conflicts. The issuer must retain current grant authority through
redemption; role change, suspension, or removal revokes their pending links. Copyable bearer possession is
not treated as mailbox verification. Every response is non-cacheable.

### `DELETE /api/auth/team/invites/:inviteId`

Revokes a pending same-tenant invitation after authentication, ADMIN authorization, local-mode, and
same-origin checks. OWNER invitations can be managed only by OWNER. Consumed, expired, revoked, foreign,
or unknown identifiers use sanitized unavailable errors. Every response is non-cacheable.

### `POST /api/auth/team/invites/accept`

Consumes an email-bound invitation exactly once. This public-auth exception requires local mode, exact
same origin, and a PostgreSQL `LOGIN_NETWORK` throttle before parsing. An enabled matching user may accept
through the environment-appropriate existing session cookie; that same session is switched to the new
organization without returning its bearer. An existing identity without an active session may instead
submit strict `{ token, email, password }`; invite availability is checked before password derivation,
`LOGIN_EMAIL` throttling and the normal credential lock policy apply, and acceptance/session creation are
bound to the verified auth generation. A new identity submits strict `{ token, displayName, password }`
and receives a new credential/membership/session. Any pre-existing membership in the invited organization
fails closed, including SUSPENDED rows, so an old invite cannot reactivate or upgrade it. Success returns
only sanitized membership state, account-created state, and a local redirect. Expiry, replay, revocation,
mismatch, throttling, and storage failures are secret-free and non-cacheable.

### `PATCH /api/auth/team/members/:userId`

Accepts exactly one strict variant: `{ "role": "MEMBER|ADMIN|OWNER" }` or
`{ "suspended": boolean }`. Authentication and ADMIN authorization precede local-mode, same-origin, and
body parsing. ADMIN manages MEMBER/ADMIN; OWNER is required for OWNER. All queries are same-tenant, and
concurrent demotion/suspension attempts preserve at least one enabled ACTIVE OWNER. Every response is
non-cacheable.

### `DELETE /api/auth/team/members/:userId`

Revokes a same-tenant membership and its selected-organization sessions after authentication, ADMIN
authorization, local-mode, and same-origin checks. The user and append-only audit evidence remain. OWNER
bounds and concurrent final-active-owner protection apply. Every response is non-cacheable.

### `/organizations`

Renders authenticated workspace listing, non-demo organization creation, and current-session selection
through the organization endpoints above. Identity and role always come from the verified session; the
browser never receives or supplies the opaque bearer.

### `/team`, `/invite`, `/reset`, and `/account`

Render built-in team/session administration plus invitation and reset redemption. Raw invite links appear
once in tenant-administrator responses; reset links appear once only in operator CLI output. Both use URL
fragments, are removed from the browser address before submission, and are never stored or rendered again
after successful use.

### `GET /api/health`

Returns service health and demo-safe defaults.

### `GET /api/orgs/current`

Returns the current verified user and selected organization summary. Explicit demo mode uses the
deterministic demo principal; local mode requires a valid opaque session and active membership.

Response shape:

```json
{
  "currentUser": {
    "id": "string",
    "email": "string",
    "role": "OWNER"
  },
  "organization": {
    "id": "string",
    "name": "string",
    "slug": "string",
    "demoMode": false,
    "timezone": "America/Los_Angeles",
    "_count": {
      "memberships": 1,
      "contacts": 0,
      "campaigns": 0,
      "conversations": 0,
      "messages": 0
    }
  }
}
```

### `GET /api/contacts`

Returns active contacts for the current organization.

### `POST /api/contacts`

Creates or updates a contact by `(orgId, phone)`.

Accepted fields: `phone`, `email`, `firstName`, `lastName`, `displayName`, `consentStatus`, `optInSource`, `source`, `notes`, `tagNames`, `listNames`.

Phone normalization is local-only by default and does not require an operator header. When paid Twilio Lookup is explicitly enabled, the caller must provide `x-signalstack-lookup-token`, which must constant-time match a server-only 32-256 character `LIVE_LOOKUP_OPERATOR_TOKEN` in addition to cost acknowledgement and complete provider credentials. Missing or invalid operator authorization, provider unavailability, a response `phone_number` that does not normalize to the exact requested number, or timeout returns `503` without writing the contact; invalid or non-mobile numbers return `400`. The operator token must not be logged, stored, returned, or forwarded to Twilio.

### `GET /api/contacts/:contactId`

Returns a single contact only when it belongs to the current organization.

### `PATCH /api/contacts/:contactId`

Updates contact profile, consent, tags/lists, or archive state only when the contact belongs to the current organization.

### `DELETE /api/contacts/:contactId`

Soft-archives the contact by setting `archivedAt`. It does not hard-delete rows.

### `POST /api/contacts/:contactId/merge`

Merges another tenant-scoped contact into the target contact from `{ "sourceContactId": "..." }`. The merge preserves the target contact, fills blank target profile fields from the source, unions local tags and lists, moves local conversation/message contact links where safe, and soft-archives the source contact. It must not hard-delete contacts, send SMS, call providers, create billing records, call live AI, bypass campaign preflight, expose secrets, or enable live messaging.

### `POST /api/contacts/imports`

Accepts JSON `{ "filename": "contacts.csv", "csv": "..." }`, parses demo-safe CSV locally, upserts valid contacts, and stores an org-scoped `ContactImport` audit record. Invalid rows are returned with row numbers.

CSV parsing always uses local phone normalization and must not call paid Twilio Lookup even when live lookup environment flags and credentials are present.

### `GET /api/templates`

Returns templates for the current organization.

### `POST /api/templates`

Creates or updates a template by `(orgId, name)`. If `variables` is omitted, variables are extracted from `{{variable}}` placeholders in `body`.

### `GET /api/templates/:templateId`

Returns a single message template only when it belongs to the current organization.

### `PATCH /api/templates/:templateId`

Updates a tenant-scoped message template from `{ "name": "...", "body": "..." }`. If `variables` is omitted, variables are extracted from `{{variable}}` placeholders in `body`. This endpoint must not render live outbound messages, schedule campaigns, send SMS, call providers, create billing records, call live AI, expose secrets, or enable live messaging.

### `GET /api/campaigns`

Returns draft and future campaign records for the current organization.

### `POST /api/campaigns`

Creates a draft campaign and optional recipient set. Any supplied `templateId` must resolve inside
the current organization; missing and cross-tenant template IDs fail without creating a campaign.
This does not schedule or send messages.

### `GET /api/campaigns/:campaignId`

Returns a tenant-scoped campaign with template and recipient contacts.

### `PATCH /api/campaigns/:campaignId`

Updates draft campaigns only. Non-draft campaigns return conflict. Any supplied `templateId` must
resolve inside the current organization before the campaign is changed.

### `POST /api/campaigns/:campaignId/preflight`

Runs a compliance preflight over campaign recipients or the provided `contactIds`. It returns allowed/blocked counts and row-level reasons. Missing or cross-tenant requested contact IDs are returned as blocked `CONTACT_NOT_FOUND` rows instead of being silently ignored. It does not send or enqueue messages.

### `POST /api/campaigns/:campaignId/schedule`

Runs preflight, marks a campaign `SCHEDULED`, cancels any other queued local jobs for the same
campaign, and stores the active queued job record. The response also reports whether the optional
BullMQ mirror was enqueued, disabled, or failed; the database job remains authoritative. This does
not call messaging providers. Expected campaign-state, active-processing, and preflight conflicts
return `409`; unexpected persistence or runtime failures return a generic `500` without reflecting
internal exception text.

### `POST /api/campaigns/:campaignId/cancel`

Atomically wins or loses against a worker claim: it marks tenant-scoped queued campaign jobs
`CANCELLED` before pausing the still-`SCHEDULED` campaign, while an active processing claim or a
concurrent terminal transition returns `409` and rolls the cancellation back. Missing tenant-scoped
campaigns return `404`. Unexpected persistence failures return a generic `500` without reflecting
internal exception text.

### `GET /api/inbox/conversations`

Returns tenant-scoped conversations with contact, assignee, recent messages, and recent internal notes.

### `POST /api/inbox/conversations`

Creates a demo-safe inbound message from `{ "phone": "...", "body": "..." }`, creating a contact/conversation when needed. Explicit `idempotencyKey` duplicates and provider-message duplicates return the existing local message/conversation before contact, conversation, timestamp, or opt-out mutations. This is local-only and does not send SMS.

### `GET /api/inbox/conversations/:conversationId`

Returns one tenant-scoped conversation.

### `GET /api/inbox/conversations/:conversationId/messages`

Returns tenant-scoped messages for the conversation in chronological order.

### `POST /api/inbox/conversations/:conversationId/messages`

Creates a demo-safe inbound message on an existing conversation. Explicit `idempotencyKey` duplicates return the existing local message before contact opt-out or conversation timestamp mutations. STOP-class keywords update local consent to `OPTED_OUT`; HELP/INFO-class keywords are recorded but do not opt the contact in or send a provider response.

### `POST /api/inbox/conversations/:conversationId/reply`

Records a demo-safe **outbound** reply on the conversation through the dummy provider — never a live send. Requires `MEMBER`. Opted-out, archived, or missing contacts are blocked with `422` and `{ "reasons": [...] }`, creating no message row. An explicit `idempotencyKey` duplicate returns the existing local message with `deduped: true` and does not insert again.

### `POST /api/inbox/conversations/:conversationId/assign`

Assigns or clears a conversation assignment with `{ "assignedToUserId": "user_id" }` or `{ "assignedToUserId": null }`. The assignee must be an active member of the current organization.

### `GET /api/inbox/conversations/:conversationId/notes`

Returns tenant-scoped internal notes for the conversation.

### `POST /api/inbox/conversations/:conversationId/notes`

Creates an internal note authored by the current demo user.

### `POST /api/inbox/conversations/:conversationId/resolve`

Resolves or reopens a conversation with `{ "resolved": true }` or `{ "resolved": false }`.

### `POST /api/demo/inbound`

Demo-only inbound entrypoint with the same behavior as `POST /api/inbox/conversations`.

### `GET /api/demo/live-test-sms`

Returns live test SMS readiness for the local investor demo: enabled state, redacted/secret-free blockers, allowlisted-recipient count and last-four hints, and configured from-number presence/last-four. It must not return full allowlist/from values, the confirmation phrase, the server-only operator token, or provider credentials; call Twilio; send SMS; mutate records; or enable campaign/live messaging by itself.

### `POST /api/demo/live-test-sms`

Accepts a client-generated UUID `requestId`, recipient, body, exact confirmation phrase, and operator-entered token. Every POST, including an existing-request status lookup, must constant-time match the 32-256 character server-only `LIVE_TEST_SMS_OPERATOR_TOKEN` before reading or reserving a request. A new Twilio-backed send additionally requires `LIVE_TEST_SMS_ENABLED=true`, `LIVE_MESSAGING_ENABLED=true`, `MESSAGING_PROVIDER=twilio`, complete Twilio environment credentials, and membership in `LIVE_TEST_SMS_TO_ALLOWLIST`. After those gates pass, it atomically reserves a tenant-scoped outbound `Message` plus `LIVE_TEST_SMS_RESERVED` audit before Twilio is called. The audit stores an HMAC-SHA-256 actor/recipient/body binding keyed by the server-side operator secret plus original recipient/from last-four, never the full recipient, full body, operator token, or provider credentials. Authorized existing keys are resolved before current live-state gates: an exact actor/binding retry returns its stored sent, failed, or reserved/pending outcome and audit-backed last-four without another Twilio call; changed actor, recipient, or body returns `409` without a provider call. A validated Twilio 4xx rejection with an integer error code and no provider SID and immediate terminal provider statuses durably fail the reservation and return `502`; network/timeout, 5xx/other non-4xx, malformed-4xx, non-2xx-with-SID, 2xx-without-provider-ID, or provider-result persistence ambiguity leaves the reservation pending and returns `202`. Provider calls use a 1-10 second bounded timeout (5 seconds by default). This endpoint is the only live-send demo surface and does not enable bulk campaign sends, workers, billing, AI, notifications, or non-allowlisted recipients.

### `GET /api/settings/compliance`

Returns the org-scoped compliance profile plus a checklist containing `complete`, `liveMessagingAllowed`, and `blockers`.

### `PATCH /api/settings/compliance`

Updates business identity, messaging use case, opt-in description, policy URLs, and demo A2P status metadata. This endpoint does not enable live SMS.

### `POST /api/ai/campaign-copy`

Returns deterministic fake campaign copy variants from `{ "prompt": "..." }` and records one local `AI_REQUEST` usage event after successful fake output.

### `POST /api/ai/reply-suggestion`

Returns a deterministic fake reply suggestion from supplied `messages` or a tenant-scoped `conversationId` and records one local `AI_REQUEST` usage event after successful fake output.

### `POST /api/ai/conversation-summary`

Returns a deterministic fake summary from supplied `messages` or a tenant-scoped `conversationId` and records one local `AI_REQUEST` usage event after successful fake output.

### `POST /api/ai/lead-qualification`

Returns deterministic fake lead qualification score, stage, and reasons from supplied `messages` or a tenant-scoped `conversationId` and records one local `AI_REQUEST` usage event after successful fake output.

### `GET /api/analytics/overview`

Returns tenant-scoped counts for contacts, total and scheduled campaigns, conversations, local outbound message delivery breakdowns including delivered, pending, failed outbound counts, the newest outbound local message timestamp, and local usage totals. Delivered outbound counts exclude rows with terminal failure evidence so stale delivery timestamps do not inflate delivery rates.

### `GET /api/billing/usage`

Returns the org billing metadata record, live-billing blocked state, local usage totals, and recent usage events.

### `POST /api/billing/usage`

Records a local usage event. This endpoint must not call Stripe or create live billing artifacts.

### `POST /api/webhooks/twilio/inbound`

Accepts Twilio `application/x-www-form-urlencoded` inbound message webhooks. M4 resolves one candidate from
strict `AccountSid` plus owned `To` number/service evidence, decrypts that account's active credential,
validates `X-Twilio-Signature`, then locks/rechecks account/ownership/credential generation inside the
resolved tenant before persistence. It never uses browser/API identity, demo fallback, or the installation-
global `TWILIO_AUTH_TOKEN` as tenant authority. Valid payloads retain the existing idempotent owner-lease
path. The handler disables sentiment analysis and keyword auto-replies and never sends SMS or invokes AI.

### `POST /api/webhooks/twilio/status`

Accepts Twilio `application/x-www-form-urlencoded` delivery status webhooks. M4 resolves one candidate from
strict `AccountSid` plus the owned outbound `From` number/service, validates with that account's active
credential, and rechecks the locked tenant state before storing the event or mutating delivery evidence.
Valid payloads retain the existing idempotent owner-lease and monotonic-status path. The handler does not
call any provider.

For both Twilio routes, malformed forms return `400`. Wrong signature/credential/destination, crossed or
unknown account/resource, detected ambiguity, disabled/revoked state, and rotation races share `403` with
`{ "error": "Provider callback rejected.", "code": "INVALID_PROVIDER_CALLBACK" }` and no tenant mutation.
Routing/crypto storage unavailability returns secret-free `503 WEBHOOK_ROUTING_UNAVAILABLE`. All denials are
`Cache-Control: no-store` and reveal no account, tenant, number, service, or credential existence.

### `GET /api/settings/provider`

Returns secret-safe aggregate provider readiness for the current organization: selected provider, demo/live
flags, compliance blockers, and safe verified/revoked/account/number/service/health summaries. It must not
return credential/envelope/routing values, call a provider, mutate state, or enable live SMS.

### `PATCH /api/settings/provider`

Retired metadata-only compatibility mutation. It requires ADMIN/same-origin authorization and returns
no-store `410 PROVIDER_METADATA_ENDPOINT_RETIRED` before reading a request body. Callers must use the
verified provider-account endpoints. It does not mutate provider state, enable messaging, or send.

### `DELETE /api/settings/provider`

M4 compatibility mutation that locally revokes the selected default provider account/credential authority.
It retains encrypted-version and audit history, does not claim provider-side revocation, and never sends.

### `GET /api/settings/provider/accounts`

Lists safe same-tenant provider-account DTOs after ADMIN authorization. It does not return plaintext,
envelope, lookup-hash, or raw provider-error fields and performs no provider call.

### `POST /api/settings/provider/accounts`

Requires ADMIN/same-origin before parsing, verifies one Twilio account through a bounded explicit provider
read, and atomically persists account identity plus an encrypted credential version. Any verification,
ownership, encryption, or persistence failure creates no partial account/credential/ownership rows.

### `GET /api/settings/provider/accounts/:accountId`

Returns one safe same-tenant provider-account DTO after ADMIN authorization. It exposes no envelope,
routing, credential, or raw provider-error fields and performs no provider call.

### `PATCH /api/settings/provider/accounts/:accountId`

Requires ADMIN/same-origin before parsing and selects the verified active account as the organization's
local default. It does not enable messaging or perform a provider-side mutation.

### `DELETE /api/settings/provider/accounts/:accountId`

Requires ADMIN/same-origin and locally revokes account and credential authority while retaining encrypted
version and immutable audit evidence. It does not claim or perform provider-side credential revocation.

### `POST /api/settings/provider/accounts/:accountId/rotate`

Verifies a replacement credential before locking/rechecking generation and atomically activating the next
encrypted version. A concurrent rotation/revocation returns `409`; the prior version becomes unusable but
is retained.

### `POST /api/settings/provider/accounts/:accountId/verify`

Explicit bounded account re-verification under the active credential. It records only safe verification
status/time/error class and never enables sending.

### `POST /api/settings/provider/accounts/:accountId/health`

Explicit bounded read-only provider health check. It records only safe status/time/error-class evidence and
does not silently revoke credentials or mutate provider resources.

### `POST /api/settings/provider/accounts/:accountId/discover`

Returns bounded, strictly parsed number and messaging-service candidates under the active verified account
without persisting ownership. Candidates contain safe IDs/last-four, canonical E.164, capabilities, provider
status, and a short-lived account/credential-generation binding only.
The opaque `pvcandidate_v1_` IDs are distinct from persistent `pvlookup_v1_` ownership/routing hashes; the
latter never enter the response.

### `POST /api/settings/provider/accounts/:accountId/import`

Imports selected fresh discovery candidates after locking/rechecking account, credential generation, and
global ownership. It never purchases, releases, ports, configures, or otherwise changes provider resources.

### `GET /api/settings/provider/accounts/:accountId/numbers`

Returns safe verified/disabled owned-number state for one same-tenant provider account.

### `GET /api/settings/provider/accounts/:accountId/messaging-services`

Returns safe verified/disabled messaging-service state for one same-tenant provider account.

### `PATCH /api/settings/provider/accounts/:accountId/messaging-services/:serviceId`

Requires ADMIN/same-origin before parsing and performs exactly one local lifecycle action: make the verified
service the account default or disable it. The URL account must own the service. No provider-side resource is
changed and no message is sent.

### `PATCH /api/settings/numbers/:numberId`

Requires ADMIN/same-origin before parsing and performs exactly one local lifecycle action: make the verified
owned number its account default or disable it. No provider-side resource is changed and no message is sent.

### `GET /api/settings/provider/rotations`

Returns bounded, safe, unverified/display-only legacy `ProviderCredentialRotation` metadata. It is not M4
provider ownership, credential authority, or canonical provider-control audit evidence. Entries exclude raw
tokens, fingerprints, envelope/routing values, and provider errors and trigger no provider call.

### `GET /api/settings/provider/rotations/export`

Returns a CSV of the same bounded legacy display-only history. It excludes plaintext/envelope/routing
values, raw provider errors, fingerprints, and provider-side secrets and triggers no mutation or external
call. Canonical M4 provider-control evidence remains in append-only `IntegrationAuditEvent` rows.

### `/settings`

Renders the consolidated go-live readiness view for the current organization. It may summarize demo operations, runtime and environment posture, campaigns, queue state, contacts, data, audiences, templates, inbox, webhooks, delivery, team, billing, reporting, AI, notifications, integrations, workflows, releases, provider-number metadata, and current blockers from existing local data and static policy. It must not execute commands, mutate records, call providers, Stripe, Redis, or live AI, send messages or notifications, expose secrets, or enable live features.

### `/settings/provider`

Renders the M4 ADMIN provider control plane: safe account/readiness/health state, unprefilled credential
verification/rotation controls, verified discovery/import for numbers/services, local revoke/disable/default
controls, and bounded legacy display-history export. Canonical M4 audit remains in append-only
`IntegrationAuditEvent`. Plaintext inputs reset after submission and are never server-rendered or
returned. The page offers no send, number purchase/release/port, provider-side mutation, or live-enable control.

### `/dashboard/campaigns/:campaignId`

Renders the owner-facing campaign detail workflow for the current organization. It may read one tenant-scoped campaign, display aggregate local recipient readiness counts, display each selected recipient's local consent/archive/send-state/block-reason snapshot, display aggregate all-outbound local campaign delivery metrics with a derived review status, last-outbound-message metadata, provider-status and provider-error-code summaries, and a visible recent-evidence row count plus recent outbound message rows with mutually exclusive delivered/failed/pending row state and provider error-code evidence, edit draft name/body/template/recipients through `PATCH /api/campaigns/:campaignId`, and cancel queued scheduled work through `POST /api/campaigns/:campaignId/cancel`. It must not edit non-draft campaign content, send SMS, call providers, run workers, create billing records, call live AI, expose secrets, send notifications, bypass preflight, hard-delete records, mutate message delivery state, retry deliveries, or enable live messaging.

### `/settings/compliance`

Renders a read-only compliance detail view for the current organization. It may display compliance profile fields, checklist completeness, A2P metadata status, hard-gate blockers, demo/live flags, and links to local readiness audit exports. The page must not mutate compliance records, enable live messaging, call providers, send notifications, create billing records, expose secrets, or perform provider-side verification.

### `/settings/health`

Renders a read-only local health operations checkpoint. It may display the existing `GET /api/health` contract, static service name, demo-safe defaults, runtime blockers, and links to the surviving operations, security, and validation surfaces. The page must not execute health probes, call APIs, run commands, mutate records, expose raw environment values or secrets, call providers, call Stripe, call live AI, send SMS, send email, send notifications, create billing records, or enable live features.

### `/settings/operations`

Renders a read-only local operations index for existing operator surfaces. It may display grouped links, local route names, static surface counts, and safety-boundary text. The page must not execute commands, inspect files, call APIs, mutate records, create exports, enqueue jobs, call Redis, call providers, call Stripe, call live AI, send SMS, send email, send notifications, expose secrets, expose raw environment values, or enable live messaging, live billing, live AI, or other live features.

### `/settings/runbook`

Renders a read-only local operator checklist based on `docs/LOCAL_OPERATOR_RUNBOOK.md`. It may display local validation, database migration/seed, worker, BullMQ smoke, admin export, and repair-loop commands. The page must not execute commands, mutate records, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

### `/settings/queue`

Renders a read-only queue operations view for the current organization. It may display scheduled-campaign queue job status counts, due versus future queued jobs, payload validity, idempotency keys, worker poll settings, queue backend metadata, Redis presence, and related campaign names. The page must not enqueue jobs, run workers, mutate queue rows, update campaign status, call Redis, call messaging providers, create billing records, send notifications, expose secrets, send SMS, or enable live messaging.

### `/settings/validation`

Renders a read-only validation operations view for the current organization. It may display static local validation gate inventory, repair signals, no-impact summary states, and validation safety-boundary text. The page may display the current demo organization name, but must not execute commands, inspect logs or test reports, scan files, read `.env.local`, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, disable rate limits, or enable live messaging, live billing, or live AI.

### `/settings/security`

Renders a read-only security operations view for the current organization. It may display demo-safe gate status, external-impact boundary status, API rate-limit policy, production override state, documented secret-storage boundaries, and validation-command references. The page must not scan files, read or expose raw environment values, reveal `.env.local`, reveal provider tokens or API keys, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, disable rate limits, or enable live messaging, live billing, or live AI.

### `/settings/readiness-audit`

Renders a read-only local go-live readiness audit view for the current organization. It may display tenant-scoped audit events, allowlisted action/subject filters, local metadata, timestamps, actor IDs, and links to the existing bounded CSV export. The page must not create, update, delete, replay, or mutate audit events; expose secrets, raw provider credentials, token fingerprints, provider verification results, or environment values; call providers, Stripe, live AI, SMS, email, or notification services; create billing records; or enable live messaging, live billing, or live AI.

### `/settings/exports`

Renders the allowlisted local administrative exports. It may link to the current tenant-scoped CSV endpoints for contacts, campaigns, provider credential-rotation metadata, and readiness-audit events. It must not execute exports during render, mutate records, expose secrets or token fingerprints, call providers, create billing records, send notifications, or enable live features.

### `/dashboard`

Renders the product-facing dashboard for the current organization. It may display tenant-scoped contact, campaign, inbox, template, compliance, local outbound message delivery evidence/rate/pending/failure/review/latest-evidence signals, local usage, fake-AI usage, navigation signals, and read-only next-step links including delivery evidence review derived from existing local counts. It must not mutate records, retry delivery, call providers, send SMS, create billing records, call live AI, expose secrets, or enable live messaging.

### `/dashboard/contacts`

Renders the product-facing contacts workspace for the current organization. It may display tenant-scoped active contacts, archived contacts, consent state, list/tag labels, contact metrics, restore links for soft-archived contacts, and a local CSV import form that posts to the existing `POST /api/contacts/imports` endpoint. It must not send SMS, call providers, create billing records, call live AI, expose secrets, hard-delete contacts, bypass import validation, or enable live messaging.

### `/dashboard/contacts/:contactId`

Renders the product-facing contact detail workspace for a tenant-scoped contact. It may update local profile fields, consent status/evidence, notes, tags, and lists through `PATCH /api/contacts/:contactId`, restore a soft-archived contact through `PATCH /api/contacts/:contactId`, soft-archive through `DELETE /api/contacts/:contactId`, and merge another active local contact into the current contact through `POST /api/contacts/:contactId/merge`. It must not send SMS, call providers, create billing records, call live AI, expose secrets, hard-delete contacts, bypass consent/preflight checks, or enable live messaging.

### `/dashboard/campaigns`

Renders the product-facing campaign workspace for the current organization. It may display tenant-scoped campaign status, current recipient readiness/blocker counts derived from local consent/archive preflight rules, local outbound delivery summaries, latest outbound evidence timestamps, create local draft campaigns through the existing campaign API, run preflight, and schedule local queue records through existing endpoints. It must not send SMS, call providers, create billing records, call live AI, expose secrets, bypass compliance preflight, execute workers, or enable live messaging.

### `/dashboard/inbox`

Renders the product-facing inbox workspace for the current organization. It may display tenant-scoped conversations, select a visible local thread with `conversationId` query state, fall back to the first visible thread when the query does not match the current tenant inbox, create local inbound demo messages, add internal notes, assign conversations, resolve or reopen threads through existing inbox endpoints, and request deterministic fake-AI conversation summary plus lead qualification from existing local AI endpoints. It must not send outbound SMS, call providers, create billing records, call live AI, expose secrets, notify contacts, or enable live messaging.

### `/dashboard/templates`

Renders the product-facing template workspace for the current organization. It may list tenant-scoped message templates and create or update local reusable copy through `POST /api/templates`, including variable extraction from template placeholders. It must not render live outbound messages, schedule campaigns, send SMS, call providers, create billing records, call live AI, expose secrets, or enable live messaging.

### `/dashboard/templates/:templateId`

Renders the product-facing template detail workflow for a tenant-scoped message template. It may update local reusable copy through `PATCH /api/templates/:templateId`, including variable extraction from template placeholders. It must not render live outbound messages, schedule campaigns, send SMS, call providers, create billing records, call live AI, expose secrets, hard-delete templates, or enable live messaging.

### `/dashboard/analytics`

Renders the product-facing analytics workspace for the current organization. It may display tenant-scoped contact, campaign, scheduled-campaign, conversation, local outbound message delivery counts, latest outbound evidence timestamp, a campaign-level delivery review summary including failed and pending campaign counts, bounded delivery review rows linking to existing campaign detail pages, and local usage totals from existing local analytics and campaign records. It must not execute reports, create exports, mutate records, retry deliveries, run workers, call providers, call Stripe, create billing artifacts, send SMS, call live AI, expose secrets, or enable live messaging.

### `/dashboard/compliance`

Renders the product-facing compliance readiness workspace for the current organization. It may display required compliance profile field status, A2P registration status, runtime hard-gate blockers, demo mode, live messaging flag state, and selected provider label. It must not register A2P campaigns, call providers, send SMS, schedule campaigns, create billing records, call live AI, expose secrets, mutate live feature flags, or enable live messaging.

### `/`

Renders the local launch dashboard. It may display demo-safe runtime defaults and links to `/demo`, the consolidated `/settings` readiness view, `/settings/operations`, `/settings/provider`, `/settings/compliance`, and `/settings/exports`. The page must not require database access, mutate records, call providers, create billing artifacts, send notifications, expose secrets, or enable live messaging.

### `GET /api/settings/numbers`

Returns tenant-scoped provider phone-number metadata for the current organization. This endpoint must not call Twilio or expose credentials.

### `POST /api/settings/numbers`

Creates or updates dummy/local provider-number metadata only. Caller-asserted `twilio` ownership is rejected
unless this method delegates to the verified account discovery/import boundary. At most one eligible sender
per configured scope may be default. It never provisions, purchases, releases, ports, enables, or sends.

### `GET /api/settings/readiness-audit`

Returns recent tenant-scoped live-readiness audit events for the current organization. Optional query parameters are bounded `limit`, allowlisted `action`, and allowlisted `subjectType` filters. These events are local records only and must not trigger notifications, provider calls, billing events, or live messaging.

### `GET /api/settings/readiness-audit/export`

Returns a CSV export of tenant-scoped live-readiness audit events for the current organization using the same bounded `limit`, allowlisted `action`, and allowlisted `subjectType` filters as the JSON audit endpoint. Every exported cell must be RFC-style quoted/escaped as needed and neutralize spreadsheet formula and row-injection prefixes. The export includes local audit metadata only. It must not expose secrets, call providers, send notifications, create billing records, enable live messaging, or mutate audit records.

### `GET /api/metrics`

Returns current-organization SMS pipeline metrics in standard Prometheus plaintext exposition format,
gated behind `OBSERVABILITY_ENABLED=true` and the current authenticated/demo-safe organization
context. The route must not scan or aggregate another tenant's messages. Delivery failures use the
shared terminal provider-status vocabulary (`failed`, `undelivered`, and `canceled`). The response
must not expose process-global counters as if they were tenant-scoped. In particular, signature
verification failures occur before trusted organization resolution and remain redacted observability
events rather than a counter in this current-organization response.

### `GET /api/contacts/segments`

Evaluates dynamic contact segment filters (tags, consent status, lead score ranges) and returns matching tenant-scoped contacts.

### `GET /api/contacts/segments/export`

Exports matching contact segment queries directly to a downloadable standard CSV file. Every cell
must neutralize spreadsheet formula prefixes and quote commas, quotes, carriage returns, and line
feeds so data cannot inject formulas or rows.

### `POST /api/templates/preview`

Accepts a non-empty tenant-scoped `templateId` and a plain object whose keys and values are strings.
It returns the plain-text SMS preview plus missing/unused parameter lists. Replacement is single-pass
so variable values cannot introduce a second placeholder expansion. HTML encoding is intentionally
not applied at this domain layer; any future HTML sink must encode at that sink.

Product endpoints must be specified here before implementation.

## Cross-Cutting API Rate Limit

Post-MVP API rate limiting foundation:

- All `/api/*` routes pass through a local in-memory rate limiter before route handlers run.
- The limiter identifies callers from forwarded IP headers when present and otherwise falls back to a deterministic local key.
- Defaults are demo-safe and generous: enabled, 120 requests per 60 seconds.
- Environment knobs are local configuration only: `API_RATE_LIMIT_ENABLED`, `API_RATE_LIMIT_MAX`, and `API_RATE_LIMIT_WINDOW_MS`.
- Rejected requests return `429` with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers.
- The limiter must not call external services, store secrets, send notifications, enable live messaging, or replace provider/webhook idempotency.
