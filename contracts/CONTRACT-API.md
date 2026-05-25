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

### `POST /api/contacts/:contactId/merge`

Merges another tenant-scoped contact into the target contact from `{ "sourceContactId": "..." }`. The merge preserves the target contact, fills blank target profile fields from the source, unions local tags and lists, moves local conversation/message contact links where safe, and soft-archives the source contact. It must not hard-delete contacts, send SMS, call providers, create billing records, call live AI, bypass campaign preflight, expose secrets, or enable live messaging.

### `POST /api/contacts/imports`

Accepts JSON `{ "filename": "contacts.csv", "csv": "..." }`, parses demo-safe CSV locally, upserts valid contacts, and stores an org-scoped `ContactImport` audit record. Invalid rows are returned with row numbers.

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

Creates a draft campaign and optional recipient set. This does not schedule or send messages.

### `GET /api/campaigns/:campaignId`

Returns a tenant-scoped campaign with template and recipient contacts.

### `PATCH /api/campaigns/:campaignId`

Updates draft campaigns only. Non-draft campaigns return conflict.

### `POST /api/campaigns/:campaignId/preflight`

Runs a compliance preflight over campaign recipients or the provided `contactIds`. It returns allowed/blocked counts and row-level reasons. Missing or cross-tenant requested contact IDs are returned as blocked `CONTACT_NOT_FOUND` rows instead of being silently ignored. It does not send or enqueue messages.

### `POST /api/campaigns/:campaignId/schedule`

Runs preflight, marks a campaign `SCHEDULED`, cancels any other queued local jobs for the same campaign, and stores the active queued job record. This does not call providers.

### `POST /api/campaigns/:campaignId/cancel`

Marks queued campaign jobs `CANCELLED` and returns the paused campaign. Missing tenant-scoped campaigns return `404`; existing non-scheduled campaigns return `409` without queue or campaign mutations.

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

Returns live test SMS readiness for the local investor demo: enabled state, redacted/secret-free blockers, configured from-number presence, and allowlisted recipients. It must not call Twilio, send SMS, mutate records, expose auth tokens, or enable campaign/live messaging by itself.

### `POST /api/demo/live-test-sms`

Sends exactly one Twilio-backed live test SMS only when `LIVE_TEST_SMS_ENABLED=true`, `LIVE_MESSAGING_ENABLED=true`, `MESSAGING_PROVIDER=twilio`, Twilio env credentials are configured, the recipient is in `LIVE_TEST_SMS_TO_ALLOWLIST`, and the request includes the exact confirmation phrase. It records a local outbound message and readiness audit event after Twilio accepts the message. This endpoint is the only live-send demo surface and does not enable bulk campaign sends, workers, billing, AI, notifications, or non-allowlisted recipients.

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

Returns tenant-scoped counts for contacts, total and scheduled campaigns, conversations, local outbound message delivery breakdowns including delivered, pending, and failed outbound counts, and local usage totals. Delivered outbound counts exclude rows with terminal failure evidence so stale delivery timestamps do not inflate delivery rates.

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

### `/dashboard/campaigns/:campaignId`

Renders the owner-facing campaign detail workflow for the current organization. It may read one tenant-scoped campaign, display each selected recipient's local consent/archive/send-state/block-reason snapshot, display existing local outbound campaign message delivery metadata with a mutually exclusive delivered/failed/pending row state, edit draft name/body/template/recipients through `PATCH /api/campaigns/:campaignId`, and cancel queued scheduled work through `POST /api/campaigns/:campaignId/cancel`. It must not edit non-draft campaign content, send SMS, call providers, run workers, create billing records, call live AI, expose secrets, send notifications, bypass preflight, hard-delete records, mutate message delivery state, retry deliveries, or enable live messaging.

### `/settings/numbers`

Renders a read-only provider phone-number metadata view for the current organization. It may display locally stored number labels, provider names, local statuses, capabilities, and default-number markers. The page must not create or update number records, provision provider numbers, verify Twilio ownership, expose credentials, call providers, send notifications, create billing records, or enable live messaging.

### `/settings/compliance`

Renders a read-only compliance detail view for the current organization. It may display compliance profile fields, checklist completeness, A2P metadata status, hard-gate blockers, demo/live flags, and links to local readiness audit exports. The page must not mutate compliance records, enable live messaging, call providers, send notifications, create billing records, expose secrets, or perform provider-side verification.

### `/settings/system`

Renders a read-only local operations snapshot for the current organization. It may display demo/live flags, selected messaging and AI providers, production-like deployment markers, queue backend metadata, Redis presence, local worker jobs-per-poll limits, and API rate-limit policy. The page must not mutate records, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

### `/settings/health`

Renders a read-only local health operations checkpoint. It may display the existing `GET /api/health` contract, static service name, demo-safe defaults, runtime blockers, and links to local system/API/security/validation surfaces. The page must not execute health probes, call APIs, run commands, mutate records, expose raw environment values or secrets, call providers, call Stripe, call live AI, send SMS, send email, send notifications, create billing records, or enable live features.

### `/settings/environment`

Renders a read-only local environment operations checkpoint. It may display demo-safe defaults, allowlisted configuration category names, derived runtime status, and links to local system/security/validation/release surfaces. The page must not read environment files, display `.env.local` contents, expose raw environment values, expose credentials or token fingerprints, mutate configuration, write files, execute commands, call APIs, call Redis, call providers, call Stripe, call live AI, send SMS, send email, send notifications, create billing records, deploy, or enable live features.

### `/settings/demo`

Renders a read-only local demo operations checkpoint for the current organization. It may display seeded demo readiness, workflow links projected from the shared operator surface inventory, local contact/campaign/conversation/message/number metrics, local usage totals, and derived runtime gates. The page must not import data, schedule or cancel campaigns, run workers, create inbox messages or replies, submit prompts, execute reports, create exports, mutate records, enqueue jobs, call Redis, call providers, call Stripe, call live AI, send SMS, send email, send notifications, expose secrets, expose full message bodies, or enable live messaging, live billing, live AI, or other live features.

### `/settings/operations`

Renders a read-only local operations index for existing operator surfaces. It may display grouped links, local route names, static surface counts, and safety-boundary text. The page must not execute commands, inspect files, call APIs, mutate records, create exports, enqueue jobs, call Redis, call providers, call Stripe, call live AI, send SMS, send email, send notifications, expose secrets, expose raw environment values, or enable live messaging, live billing, live AI, or other live features.

### `/settings/runbook`

Renders a read-only local operator checklist based on `docs/LOCAL_OPERATOR_RUNBOOK.md`. It may display local validation, database migration/seed, worker, BullMQ smoke, admin export, and repair-loop commands. The page must not execute commands, mutate records, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

### `/settings/usage`

Renders a read-only local usage and analytics view for the current organization. It may display tenant-scoped contact, campaign, conversation, message, local usage totals, billing account metadata, and recent local usage events. The page must not mutate records, call Stripe, create billing provider artifacts, send notifications, call providers, expose secrets, or enable live messaging.

### `/settings/campaigns`

Renders a read-only campaign operations view for the current organization. It may display existing campaign status counts, recipient counts, scheduled campaign metadata, queue job status counts, idempotency keys, and local worker boundary text. The page must not create, update, schedule, cancel, send, or delete campaigns; run workers; mutate queue rows; call messaging providers; create billing records; send notifications; expose secrets; or enable live messaging.

### `/settings/queue`

Renders a read-only queue operations view for the current organization. It may display scheduled-campaign queue job status counts, due versus future queued jobs, payload validity, idempotency keys, worker poll settings, queue backend metadata, Redis presence, and related campaign names. The page must not enqueue jobs, run workers, mutate queue rows, update campaign status, call Redis, call messaging providers, create billing records, send notifications, expose secrets, send SMS, or enable live messaging.

### `/settings/contacts`

Renders a read-only contact operations view for the current organization. It may display active contact counts, consent status counts, contact import status counts, imported/failed row totals, tag counts, list counts, and recent contact/import metadata. The page must not import contacts, create or update contacts, update consent, mutate tags/lists, hard-delete records, call messaging providers, send notifications, create billing records, expose secrets, send SMS, or enable live messaging.

### `/settings/data`

Renders a read-only data operations view for the current organization. It may display tenant-scoped local record totals, active versus archived contact counts, import row totals, local audit/export boundary status, and recent archived contact metadata. The page must not hard-delete data, restore archived records, run exports, mutate records, call providers, create billing records, send notifications, expose secrets, send SMS, call live AI, or enable live messaging, live billing, or live AI.

### `/settings/audience`

Renders a read-only audience operations view for the current organization. It may display tag counts, list member counts, saved segment names, segment definitions, and segment update timestamps. The page must not create or update tags/lists/segments, change contact memberships, evaluate segments for campaign sending, call messaging providers, send notifications, create billing records, expose secrets, send SMS, or enable live messaging.

### `/settings/templates`

Renders a read-only template operations view for the current organization. It may display message template counts, variable names, campaign usage counts, and local text previews. The page must not create templates, update template copy, render live outbound messages, schedule campaigns, call messaging providers, send notifications, create billing records, expose secrets, send SMS, or enable live messaging.

### `/settings/inbox`

Renders a read-only inbox operations view for the current organization. It may display conversation status counts, assignment counts, recent message/note counts, contact display names, assignee display names, and local inbox safety-boundary text. The page must not create messages, assign conversations, resolve conversations, add notes, mutate contacts or consent, call messaging providers, send notifications, create billing records, expose secrets, send SMS, or enable live messaging.

### `/settings/webhooks`

Renders a read-only webhook operations view for the current organization. It may display Twilio webhook route coverage, local stored webhook event counts, provider/event-type summaries, recent idempotency keys, received timestamps, and webhook safety-boundary text. The page must not replay webhooks, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, send notifications, expose secrets, create billing records, send SMS, or enable live messaging.

### `/settings/delivery`

Renders a read-only delivery operations view for the current organization. It may display existing tenant-scoped message direction counts, delivery metadata, provider status labels, provider message ID presence, campaign/conversation context, idempotency keys, and delivery safety-boundary text. The page must not send SMS, retry deliveries, replay webhooks, mutate messages, mutate campaigns, call providers, create billing records, send notifications, expose secrets, or enable live messaging.

### `/settings/team`

Renders a read-only team operations view for the current organization. It may display organization metadata, membership role/status counts, member display names, member emails, assigned conversation counts, authored internal-note counts, and local team safety-boundary text. The page must not invite users, create users, update roles, suspend members, delete memberships, call Clerk, send email, send notifications, expose secrets, create billing records, call messaging providers, send SMS, or enable live messaging.

### `/settings/billing`

Renders a read-only billing operations view for the current organization. It may display local billing account status, live billing gate status, Stripe placeholder presence, usage-event totals, recent local usage-event metadata, and billing safety-boundary text. The page must not create billing accounts beyond the existing local demo-safe upsert helper, call Stripe, create subscriptions, create invoices, collect payment methods, charge cards, send email, send notifications, expose secrets, call messaging providers, send SMS, or enable live billing.

### `/settings/reports`

Renders a read-only reporting index for the current organization. It may display existing local report links, tenant-scoped analytics counts, local usage totals, readiness audit signals, and reporting safety-boundary text. The page must not execute report jobs, create exports, mutate records, call providers, call Stripe, call live AI, send SMS, send email, send notifications, expose secrets, or enable live messaging, live billing, or live AI.

### `/settings/integrations`

Renders a read-only integration operations view for the current organization. It may display existing local integration surfaces for messaging provider metadata, provider numbers, inbound webhooks, fake AI, local billing, and notification no-send boundaries. The page must not call providers, submit prompts, call live AI, call Stripe, send SMS, send email, send notifications, emit outbound webhooks, expose secrets or token fingerprints, mutate records, enqueue jobs, create exports, or enable live messaging, live billing, or live AI.

### `/settings/workflows`

Renders a read-only workflow operations view for the current organization. It may display existing local demo workflow checkpoints across contacts, campaigns, queue, inbox, delivery, AI, usage, and reporting surfaces. The page must not import contacts, schedule or cancel campaigns, run workers, create inbox replies, retry deliveries, submit prompts, execute reports, create exports, mutate records, enqueue jobs, call Redis, call providers, call Stripe, call live AI, send SMS, send email, send notifications, expose secrets, or enable live messaging, live billing, or live AI.

### `/settings/releases`

Renders a read-only release operations view for the current organization. It may display local release checklist commands, protected gate expectations, seeded demo path expectations, premerge validation metadata, release surface links, and runtime safety boundaries. The page must not execute commands, run scripts, run migrations, launch tests or browsers, perform git operations, deploy, mutate records, enqueue jobs, create exports, call Redis, call providers, call Stripe, call live AI, send SMS, send email, send notifications, expose secrets/logs/diffs/env values, or enable live messaging, live billing, or live AI.

### `/settings/ai`

Renders a read-only AI operations view for the current organization. It may display the selected AI provider, fake-provider readiness, live-AI blocked state, deterministic AI endpoint coverage, local AI usage totals, recent local AI usage-event metadata, and AI safety-boundary text. The page must not submit prompts, mutate conversations, call live AI providers, create paid model requests, expose API keys, create billing provider artifacts, send notifications, call messaging providers, send SMS, or enable live AI.

### `/settings/api`

Renders a read-only API operations view for the current organization. It may display static local API route inventory, route areas, read/write classification, external-impact classification, local safety notes, and API rate-limit policy. The page must not execute API handlers, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, disable rate limits, or enable live messaging, live billing, or live AI.

### `/settings/contracts`

Renders a read-only contract operations view for the current organization. It may display static local contract inventory, drift controls, validation command references, and contract safety-boundary text. The page may display the current demo organization name, but must not read contract file contents, execute validation commands, scan files, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, disable rate limits, or enable live messaging, live billing, or live AI.

### `/settings/validation`

Renders a read-only validation operations view for the current organization. It may display static local validation gate inventory, repair signals, no-impact summary states, and validation safety-boundary text. The page may display the current demo organization name, but must not execute commands, inspect logs or test reports, scan files, read `.env.local`, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, disable rate limits, or enable live messaging, live billing, or live AI.

### `/settings/security`

Renders a read-only security operations view for the current organization. It may display demo-safe gate status, external-impact boundary status, API rate-limit policy, production override state, documented secret-storage boundaries, and validation-command references. The page must not scan files, read or expose raw environment values, reveal `.env.local`, reveal provider tokens or API keys, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, disable rate limits, or enable live messaging, live billing, or live AI.

### `/settings/notifications`

Renders a read-only notification operations view for the current organization. It may display demo-safe notification channel boundaries, no-send controls, live messaging/billing status, provider status, and future notification-provider gate requirements. The page must not create notification recipients, subscriptions, templates, jobs, sends, alerts, or webhooks; call email, SMS, browser notification, provider, Stripe, or live AI services; expose secrets; send notifications; send SMS; send email; mutate records; or enable live messaging, live billing, or live AI.

### `/settings/readiness-audit`

Renders a read-only local go-live readiness audit view for the current organization. It may display tenant-scoped audit events, allowlisted action/subject filters, local metadata, timestamps, actor IDs, and links to the existing bounded CSV export. The page must not create, update, delete, replay, or mutate audit events; expose secrets, raw provider credentials, token fingerprints, provider verification results, or environment values; call providers, Stripe, live AI, SMS, email, or notification services; create billing records; or enable live messaging, live billing, or live AI.

### `/dashboard`

Renders the product-facing dashboard for the current organization. It may display tenant-scoped contact, campaign, inbox, template, compliance, local outbound message delivery rate/pending/failure signals, local usage, fake-AI usage, navigation signals, and read-only next-step links derived from existing local counts. It must not mutate records, retry delivery, call providers, send SMS, create billing records, call live AI, expose secrets, or enable live messaging.

### `/dashboard/contacts`

Renders the product-facing contacts workspace for the current organization. It may display tenant-scoped active contacts, archived contacts, consent state, list/tag labels, contact metrics, restore links for soft-archived contacts, and a local CSV import form that posts to the existing `POST /api/contacts/imports` endpoint. It must not send SMS, call providers, create billing records, call live AI, expose secrets, hard-delete contacts, bypass import validation, or enable live messaging.

### `/dashboard/contacts/:contactId`

Renders the product-facing contact detail workspace for a tenant-scoped contact. It may update local profile fields, consent status/evidence, notes, tags, and lists through `PATCH /api/contacts/:contactId`, restore a soft-archived contact through `PATCH /api/contacts/:contactId`, soft-archive through `DELETE /api/contacts/:contactId`, and merge another active local contact into the current contact through `POST /api/contacts/:contactId/merge`. It must not send SMS, call providers, create billing records, call live AI, expose secrets, hard-delete contacts, bypass consent/preflight checks, or enable live messaging.

### `/dashboard/campaigns`

Renders the product-facing campaign workspace for the current organization. It may display tenant-scoped campaign status, current recipient readiness/blocker counts derived from local consent/archive preflight rules, local outbound delivery summaries, create local draft campaigns through the existing campaign API, run preflight, and schedule local queue records through existing endpoints. It must not send SMS, call providers, create billing records, call live AI, expose secrets, bypass compliance preflight, execute workers, or enable live messaging.

### `/dashboard/inbox`

Renders the product-facing inbox workspace for the current organization. It may display tenant-scoped conversations, select a visible local thread with `conversationId` query state, fall back to the first visible thread when the query does not match the current tenant inbox, create local inbound demo messages, add internal notes, assign conversations, resolve or reopen threads through existing inbox endpoints, and request deterministic fake-AI conversation summary plus lead qualification from existing local AI endpoints. It must not send outbound SMS, call providers, create billing records, call live AI, expose secrets, notify contacts, or enable live messaging.

### `/dashboard/templates`

Renders the product-facing template workspace for the current organization. It may list tenant-scoped message templates and create or update local reusable copy through `POST /api/templates`, including variable extraction from template placeholders. It must not render live outbound messages, schedule campaigns, send SMS, call providers, create billing records, call live AI, expose secrets, or enable live messaging.

### `/dashboard/templates/:templateId`

Renders the product-facing template detail workflow for a tenant-scoped message template. It may update local reusable copy through `PATCH /api/templates/:templateId`, including variable extraction from template placeholders. It must not render live outbound messages, schedule campaigns, send SMS, call providers, create billing records, call live AI, expose secrets, hard-delete templates, or enable live messaging.

### `/dashboard/analytics`

Renders the product-facing analytics workspace for the current organization. It may display tenant-scoped contact, campaign, scheduled-campaign, conversation, local outbound message delivery, and local usage totals from the existing analytics overview. It must not execute reports, create exports, mutate records, call providers, call Stripe, create billing artifacts, send SMS, call live AI, expose secrets, or enable live messaging.

### `/dashboard/compliance`

Renders the product-facing compliance readiness workspace for the current organization. It may display required compliance profile field status, A2P registration status, runtime hard-gate blockers, demo mode, live messaging flag state, and selected provider label. It must not register A2P campaigns, call providers, send SMS, schedule campaigns, create billing records, call live AI, expose secrets, mutate live feature flags, or enable live messaging.

### `/`

Renders the local launch dashboard. It may display demo-safe runtime defaults and links to existing local-only demo, readiness, provider metadata, system, usage, and admin export views. The page must not require database access, mutate records, call providers, create billing artifacts, send notifications, expose secrets, or enable live messaging.

### `GET /api/settings/numbers`

Returns tenant-scoped provider phone-number metadata for the current organization. This endpoint must not call Twilio or expose credentials.

### `POST /api/settings/numbers`

Creates or updates tenant-scoped provider phone-number metadata from `{ "phoneNumber": "+15555550123", "provider": "dummy", "capabilities": ["sms"], "isDefault": true }`. This endpoint is local metadata only; it must not provision numbers, validate live ownership, store secrets, enable live messaging, or send SMS.

### `GET /api/settings/readiness-audit`

Returns recent tenant-scoped live-readiness audit events for the current organization. Optional query parameters are bounded `limit`, allowlisted `action`, and allowlisted `subjectType` filters. These events are local records only and must not trigger notifications, provider calls, billing events, or live messaging.

### `GET /api/settings/readiness-audit/export`

Returns a CSV export of tenant-scoped live-readiness audit events for the current organization using the same bounded `limit`, allowlisted `action`, and allowlisted `subjectType` filters as the JSON audit endpoint. The export includes local audit metadata only. It must not expose secrets, call providers, send notifications, create billing records, enable live messaging, or mutate audit records.

Product endpoints must be specified here before implementation.

## Cross-Cutting API Rate Limit

Post-MVP API rate limiting foundation:

- All `/api/*` routes pass through a local in-memory rate limiter before route handlers run.
- The limiter identifies callers from forwarded IP headers when present and otherwise falls back to a deterministic local key.
- Defaults are demo-safe and generous: enabled, 120 requests per 60 seconds.
- Environment knobs are local configuration only: `API_RATE_LIMIT_ENABLED`, `API_RATE_LIMIT_MAX`, and `API_RATE_LIMIT_WINDOW_MS`.
- Rejected requests return `429` with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers.
- The limiter must not call external services, store secrets, send notifications, enable live messaging, or replace provider/webhook idempotency.
