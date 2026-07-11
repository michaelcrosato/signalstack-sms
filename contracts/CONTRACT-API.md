# API Contract

Owner: backend-data and frontend-ui.

## Implemented Endpoints

### `GET /api/health`

Returns service health and demo-safe defaults.

### `GET /api/orgs/current`

Returns the demo-safe current user and organization summary.

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
    "demoMode": true,
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

Accepts Twilio `application/x-www-form-urlencoded` inbound message webhooks. The request must pass `X-Twilio-Signature` validation with `TWILIO_AUTH_TOKEN`; unsigned requests are rejected. Valid payloads are stored as raw org-scoped webhook events by idempotency key and create local inbound inbox messages only after acquiring an expiring owner lease. Successful and already processed events return `204`; an unprocessed event owned by another request returns `409` with an advisory `Retry-After`. Upstream retry behavior must be configured explicitly. The handler disables sentiment analysis and keyword auto-replies, and does not send SMS or invoke AI.

### `POST /api/webhooks/twilio/status`

Accepts Twilio `application/x-www-form-urlencoded` delivery status webhooks. The request must pass `X-Twilio-Signature` validation with `TWILIO_AUTH_TOKEN`; unsigned requests are rejected. Valid payloads are stored as raw org-scoped webhook events by idempotency key and mutate local delivery state only after acquiring an expiring owner lease. Successful and already processed events return `204`; an unprocessed event owned by another request returns `409` with an advisory `Retry-After`. Upstream retry behavior must be configured explicitly. The handler does not call any provider.

### `GET /api/settings/provider`

Returns secret-safe messaging provider readiness for the current organization: selected provider, demo mode, live messaging flag, live messaging blockers, compliance readiness, and Twilio credential presence booleans. This endpoint must not return credential values, mutate provider state, or enable live SMS.

### `PATCH /api/settings/provider`

Stores local, secret-safe Twilio credential readiness metadata from `{ "provider": "twilio", "twilio": { "accountSid": "...", "authToken": "...", "fromNumber": "+15555550199" } }`. The handler may persist redacted account/from-number fields and a one-way token fingerprint only. It must not return or persist raw auth tokens, call Twilio, validate live ownership, enable live messaging, or send SMS.

### `DELETE /api/settings/provider`

Clears local Twilio credential readiness metadata for the current organization. The handler must not call Twilio, revoke provider credentials, disable provider accounts, enable live messaging, or send SMS. It records a local readiness audit event.

### `GET /api/settings/provider/rotations`

Returns recent tenant-scoped provider credential metadata history for the current organization. Optional query parameters are `action=CONFIGURED|REFRESHED|ROTATED|DELETED` and bounded `limit`. Entries include provider, action, redacted account/from-number values, last-four hints, configured booleans, actor ID, and timestamp. The response must not include raw auth tokens, token fingerprints, provider credential values, provider verification results, or trigger provider calls/live messaging.

### `GET /api/settings/provider/rotations/export`

Returns a CSV export of recent tenant-scoped provider credential metadata history for the current organization using the same allowlisted `action` and bounded `limit` filters as the JSON rotation endpoint. The export includes redacted local credential metadata only. It must not include raw auth tokens, token fingerprints, provider verification results, provider-side state, or trigger provider calls, live messaging, billing records, notifications, or mutations.

### `/settings`

Renders the consolidated go-live readiness view for the current organization. It may summarize demo operations, runtime and environment posture, campaigns, queue state, contacts, data, audiences, templates, inbox, webhooks, delivery, team, billing, reporting, AI, notifications, integrations, workflows, releases, provider-number metadata, and current blockers from existing local data and static policy. It must not execute commands, mutate records, call providers, Stripe, Redis, or live AI, send messages or notifications, expose secrets, or enable live features.

### `/settings/provider`

Renders provider details for the current organization. It may submit local Twilio credential metadata to `PATCH /api/settings/provider`, clear local metadata through `DELETE /api/settings/provider`, filter local rotation history, and link to its bounded CSV export. It must render and export redacted values only and must not expose raw auth tokens or token fingerprints, claim provider verification, call providers, revoke provider-side credentials, offer live-send controls, or enable live messaging.

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

Creates or updates tenant-scoped provider phone-number metadata from `{ "phoneNumber": "+15555550123", "provider": "dummy", "capabilities": ["sms"], "isDefault": true }`. At most one number per organization may be the default. This endpoint is local metadata only; it must not provision numbers, validate live ownership, store secrets, enable live messaging, or send SMS.

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
