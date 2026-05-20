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

### `GET /api/contacts/:contactId`

Returns a single contact only when it belongs to the current organization.

### `PATCH /api/contacts/:contactId`

Updates contact profile, consent, tags/lists, or archive state only when the contact belongs to the current organization.

### `DELETE /api/contacts/:contactId`

Soft-archives the contact by setting `archivedAt`. It does not hard-delete rows.

### `POST /api/contacts/imports`

Accepts JSON `{ "filename": "contacts.csv", "csv": "..." }`, parses demo-safe CSV locally, upserts valid contacts, and stores an org-scoped `ContactImport` audit record. Invalid rows are returned with row numbers.

### `GET /api/templates`

Returns templates for the current organization.

### `POST /api/templates`

Creates or updates a template by `(orgId, name)`. If `variables` is omitted, variables are extracted from `{{variable}}` placeholders in `body`.

### `GET /api/campaigns`

Returns draft and future campaign records for the current organization.

### `POST /api/campaigns`

Creates a draft campaign and optional recipient set. This does not schedule or send messages.

### `GET /api/campaigns/:campaignId`

Returns a tenant-scoped campaign with template and recipient contacts.

### `PATCH /api/campaigns/:campaignId`

Updates draft campaigns only. Non-draft campaigns return conflict.

### `POST /api/campaigns/:campaignId/preflight`

Runs a compliance preflight over campaign recipients or the provided `contactIds`. It returns allowed/blocked counts and row-level reasons. It does not send or enqueue messages.

### `POST /api/campaigns/:campaignId/schedule`

Runs preflight, marks a campaign `SCHEDULED`, and stores a queued job record. This does not call providers.

### `POST /api/campaigns/:campaignId/cancel`

Marks queued campaign jobs `CANCELLED` and returns the paused campaign.

### `GET /api/inbox/conversations`

Returns tenant-scoped conversations with contact, assignee, recent messages, and recent internal notes.

### `POST /api/inbox/conversations`

Creates a demo-safe inbound message from `{ "phone": "...", "body": "..." }`, creating a contact/conversation when needed. This is local-only and does not send SMS.

### `GET /api/inbox/conversations/:conversationId`

Returns one tenant-scoped conversation.

### `GET /api/inbox/conversations/:conversationId/messages`

Returns tenant-scoped messages for the conversation in chronological order.

### `POST /api/inbox/conversations/:conversationId/messages`

Creates a demo-safe inbound message on an existing conversation. STOP-class keywords update local consent to `OPTED_OUT`; HELP is recorded but does not opt the contact in or send a provider response.

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

### `GET /api/settings/compliance`

Returns the org-scoped compliance profile plus a checklist containing `complete`, `liveMessagingAllowed`, and `blockers`.

### `PATCH /api/settings/compliance`

Updates business identity, messaging use case, opt-in description, policy URLs, and demo A2P status metadata. This endpoint does not enable live SMS.

### `POST /api/ai/campaign-copy`

Returns deterministic fake campaign copy variants from `{ "prompt": "..." }`.

### `POST /api/ai/reply-suggestion`

Returns a deterministic fake reply suggestion from supplied `messages` or a tenant-scoped `conversationId`.

### `POST /api/ai/conversation-summary`

Returns a deterministic fake summary from supplied `messages` or a tenant-scoped `conversationId`.

### `POST /api/ai/lead-qualification`

Returns deterministic fake lead qualification score, stage, and reasons from supplied `messages` or a tenant-scoped `conversationId`.

### `GET /api/analytics/overview`

Returns tenant-scoped counts for contacts, campaigns, conversations, messages, and local usage totals.

### `GET /api/billing/usage`

Returns the org billing metadata record, live-billing blocked state, local usage totals, and recent usage events.

### `POST /api/billing/usage`

Records a local usage event. This endpoint must not call Stripe or create live billing artifacts.

### `POST /api/webhooks/twilio/inbound`

Accepts Twilio `application/x-www-form-urlencoded` inbound message webhooks. The request must pass `X-Twilio-Signature` validation with `TWILIO_AUTH_TOKEN`; unsigned requests are rejected. Valid payloads are stored as raw org-scoped webhook events by idempotency key and create local inbound inbox messages only. The handler returns `204` and does not send automatic SMS replies.

### `POST /api/webhooks/twilio/status`

Accepts Twilio `application/x-www-form-urlencoded` delivery status webhooks. The request must pass `X-Twilio-Signature` validation with `TWILIO_AUTH_TOKEN`; unsigned requests are rejected. Valid payloads are stored as raw org-scoped webhook events by idempotency key. The handler returns `204` and does not call any provider.

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

### `/settings/provider`

Renders the provider details UI for the current organization. It may submit local Twilio credential metadata to `PATCH /api/settings/provider`, clear local metadata through `DELETE /api/settings/provider`, filter local rotation history by action, and link to the local CSV rotation-history export. The page must render/export redacted values only after submission and must not expose raw auth tokens, token fingerprints, provider verification status, live-send controls, or provider-side revocation controls.

### `/settings/numbers`

Renders a read-only provider phone-number metadata view for the current organization. It may display locally stored number labels, provider names, local statuses, capabilities, and default-number markers. The page must not create or update number records, provision provider numbers, verify Twilio ownership, expose credentials, call providers, send notifications, create billing records, or enable live messaging.

### `/settings/compliance`

Renders a read-only compliance detail view for the current organization. It may display compliance profile fields, checklist completeness, A2P metadata status, hard-gate blockers, demo/live flags, and links to local readiness audit exports. The page must not mutate compliance records, enable live messaging, call providers, send notifications, create billing records, expose secrets, or perform provider-side verification.

### `/settings/system`

Renders a read-only local operations snapshot for the current organization. It may display demo/live flags, selected messaging and AI providers, production-like deployment markers, queue backend metadata, Redis presence, local worker jobs-per-poll limits, and API rate-limit policy. The page must not mutate records, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

### `/settings/runbook`

Renders a read-only local operator checklist based on `docs/LOCAL_OPERATOR_RUNBOOK.md`. It may display local validation, database migration/seed, worker, BullMQ smoke, admin export, and repair-loop commands. The page must not execute commands, mutate records, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

### `/settings/usage`

Renders a read-only local usage and analytics view for the current organization. It may display tenant-scoped contact, campaign, conversation, message, local usage totals, billing account metadata, and recent local usage events. The page must not mutate records, call Stripe, create billing provider artifacts, send notifications, call providers, expose secrets, or enable live messaging.

### `/settings/campaigns`

Renders a read-only campaign operations view for the current organization. It may display existing campaign status counts, recipient counts, scheduled campaign metadata, queue job status counts, idempotency keys, and local worker boundary text. The page must not create, update, schedule, cancel, send, or delete campaigns; run workers; mutate queue rows; call messaging providers; create billing records; send notifications; expose secrets; or enable live messaging.

### `/settings/contacts`

Renders a read-only contact operations view for the current organization. It may display active contact counts, consent status counts, contact import status counts, imported/failed row totals, tag counts, list counts, and recent contact/import metadata. The page must not import contacts, create or update contacts, update consent, mutate tags/lists, hard-delete records, call messaging providers, send notifications, create billing records, expose secrets, send SMS, or enable live messaging.

### `/settings/inbox`

Renders a read-only inbox operations view for the current organization. It may display conversation status counts, assignment counts, recent message/note counts, contact display names, assignee display names, and local inbox safety-boundary text. The page must not create messages, assign conversations, resolve conversations, add notes, mutate contacts or consent, call messaging providers, send notifications, create billing records, expose secrets, send SMS, or enable live messaging.

### `/`

Renders the local launch dashboard. It may display demo-safe runtime defaults and links to existing local-only demo, readiness, provider metadata, system, usage, and admin export views. The page must not require database access, mutate records, call providers, create billing artifacts, send notifications, expose secrets, or enable live messaging.

### `GET /api/settings/numbers`

Returns tenant-scoped provider phone-number metadata for the current organization. This endpoint must not call Twilio or expose credentials.

### `POST /api/settings/numbers`

Creates or updates tenant-scoped provider phone-number metadata from `{ "phoneNumber": "+15555550123", "provider": "dummy", "capabilities": ["sms"], "isDefault": true }`. This endpoint is local metadata only; it must not provision numbers, validate live ownership, store secrets, enable live messaging, or send SMS.

### `GET /api/settings/readiness-audit`

Returns recent tenant-scoped live-readiness audit events for the current organization. Optional query parameters are bounded `limit`, `action`, and `subjectType` filters. These events are local records only and must not trigger notifications, provider calls, billing events, or live messaging.

### `GET /api/settings/readiness-audit/export`

Returns a CSV export of tenant-scoped live-readiness audit events for the current organization using the same bounded `limit`, `action`, and `subjectType` filters as the JSON audit endpoint. The export includes local audit metadata only. It must not expose secrets, call providers, send notifications, create billing records, enable live messaging, or mutate audit records.

Product endpoints must be specified here before implementation.

## Cross-Cutting API Rate Limit

Post-MVP API rate limiting foundation:

- All `/api/*` routes pass through a local in-memory rate limiter before route handlers run.
- The limiter identifies callers from forwarded IP headers when present and otherwise falls back to a deterministic local key.
- Defaults are demo-safe and generous: enabled, 120 requests per 60 seconds.
- Environment knobs are local configuration only: `API_RATE_LIMIT_ENABLED`, `API_RATE_LIMIT_MAX`, and `API_RATE_LIMIT_WINDOW_MS`.
- Rejected requests return `429` with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers.
- The limiter must not call external services, store secrets, send notifications, enable live messaging, or replace provider/webhook idempotency.
