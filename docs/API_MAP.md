# API Map

Milestone 0:

- `GET /api/health`: returns service health and demo-safe defaults.

Milestone 1:

- `GET /api/orgs/current`: returns deterministic current user and organization summary.

Milestone 2:

- `GET /api/contacts`: lists active contacts.
- `POST /api/contacts`: creates or upserts a contact by phone.
- `GET /api/contacts/:contactId`: returns a tenant-scoped contact.
- `PATCH /api/contacts/:contactId`: updates a tenant-scoped contact.
- `DELETE /api/contacts/:contactId`: soft-archives a tenant-scoped contact.
- `POST /api/contacts/:contactId/merge`: merges another tenant-scoped contact into the target and soft-archives the source without hard deletion or external impact.
- `POST /api/contacts/imports`: imports contacts from local CSV text.

Milestone 3:

- `GET /api/templates`: lists message templates.
- `POST /api/templates`: creates or upserts a message template.
- `GET /api/templates/:templateId`: returns one tenant-scoped message template.
- `PATCH /api/templates/:templateId`: updates one tenant-scoped local message template.
- `GET /api/campaigns`: lists campaigns.
- `POST /api/campaigns`: creates a draft campaign.
- `GET /api/campaigns/:campaignId`: reads a tenant-scoped campaign.
- `PATCH /api/campaigns/:campaignId`: updates a draft campaign.
- `POST /api/campaigns/:campaignId/preflight`: checks recipients without sending.

Milestone 4:

- `POST /api/campaigns/:campaignId/schedule`: stores a queued scheduled-campaign job after preflight.
- `POST /api/campaigns/:campaignId/cancel`: cancels queued jobs and pauses scheduled campaigns; existing non-scheduled campaigns return `409` without mutation.

Milestone 5:

- `GET /api/inbox/conversations`: lists inbox conversations.
- `POST /api/inbox/conversations`: creates demo-safe inbound messages.
- `GET /api/inbox/conversations/:conversationId`: reads one conversation.
- `GET /api/inbox/conversations/:conversationId/messages`: lists conversation messages.
- `POST /api/inbox/conversations/:conversationId/messages`: creates a demo-safe inbound message.
- `POST /api/inbox/conversations/:conversationId/assign`: assigns or clears conversation assignment.
- `GET /api/inbox/conversations/:conversationId/notes`: lists internal notes.
- `POST /api/inbox/conversations/:conversationId/notes`: creates an internal note.
- `POST /api/inbox/conversations/:conversationId/resolve`: resolves or reopens a conversation.
- `POST /api/demo/inbound`: creates a demo-safe inbound message.
- `GET /api/demo/live-test-sms`: returns live test SMS readiness without sending or exposing secrets.
- `POST /api/demo/live-test-sms`: sends one Twilio-backed allowlisted live test SMS only when explicit live-test gates and confirmation pass.

Milestone 6:

- `GET /api/settings/compliance`: returns compliance profile and hard-gate checklist.
- `PATCH /api/settings/compliance`: updates compliance readiness metadata.

Milestone 7:

- `POST /api/ai/campaign-copy`: returns fake campaign copy variants and records local AI usage.
- `POST /api/ai/reply-suggestion`: returns a fake reply suggestion and records local AI usage.
- `POST /api/ai/conversation-summary`: returns a fake conversation summary and records local AI usage.
- `POST /api/ai/lead-qualification`: returns fake lead qualification and records local AI usage.

Milestone 8:

- `GET /api/analytics/overview`: returns tenant-scoped aggregate analytics, including scheduled campaign counts and outbound-only local delivered, pending, and failed message delivery breakdowns.
- `GET /api/billing/usage`: returns local billing metadata and usage totals.
- `POST /api/billing/usage`: records a local usage event only.

Milestone 9:

- `GET /demo`: renders the investor demo console backed by seeded local data.

Post-MVP webhook foundation:

- `POST /api/webhooks/twilio/inbound`: validates a Twilio form webhook signature, stores raw inbound payloads idempotently, and creates a local inbound inbox message without sending replies.
- `POST /api/webhooks/twilio/status`: validates a Twilio form webhook signature and stores raw delivery-status payloads idempotently without provider callbacks.

Post-MVP provider settings foundation:

- `/`: renders a static local launch dashboard with demo-safe defaults and links to existing local-only admin/demo views without database access, mutations, provider calls, billing artifacts, notifications, live messaging, or secrets.
- `/dashboard`: renders a product-facing dashboard with tenant-scoped product metrics, outbound-only local message delivery rate/pending/failure signals, local usage totals, and navigation links without mutations, delivery retries, provider calls, SMS, billing artifacts, live AI, secrets, or live messaging enablement.
- `/dashboard/contacts`: renders a product-facing contacts workspace with tenant-scoped active contacts, consent/list/tag context, metrics, and a local CSV import form backed by `POST /api/contacts/imports` without provider calls, SMS, billing, live AI, secrets, hard deletion, validation bypasses, or live messaging enablement.
- `/dashboard/contacts/:contactId`: renders a product-facing contact detail workspace with local profile, consent, notes, tags, list editing, soft archive, restore, and duplicate-merge actions backed by existing contact APIs without provider calls, SMS, billing, live AI, secrets, hard deletion, consent bypasses, or live messaging enablement.
- `/dashboard/campaigns`: renders a product-facing campaign workspace with local draft creation, compliance preflight, and local schedule actions backed by existing campaign APIs without provider calls, SMS, billing, live AI, secrets, worker execution, or live messaging enablement.
- `/dashboard/campaigns/:campaignId`: renders a product-facing campaign detail workspace with local recipient consent/archive/send-state/block-reason visibility, existing outbound campaign message delivery metadata, local draft edit, and queued-campaign cancellation actions backed by existing campaign APIs without provider calls, SMS, billing, live AI, notifications, secrets, worker execution, delivery retries, message delivery mutation, or live messaging enablement.
- `/dashboard/inbox`: renders a product-facing inbox workspace with tenant-scoped threads, local inbound replies, notes, assignment, and resolve/reopen actions backed by existing inbox APIs without outbound SMS, provider calls, billing, live AI, notifications, secrets, or live messaging enablement.
- `/dashboard/templates`: renders a product-facing template workspace with tenant-scoped template rows, local template creation/upsert, detected variables, and campaign usage counts backed by `GET/POST /api/templates` without live outbound rendering, provider calls, SMS, billing, live AI, secrets, or live messaging enablement.
- `/dashboard/templates/:templateId`: renders a product-facing template detail/edit workflow backed by `GET/PATCH /api/templates/:templateId` without live outbound rendering, scheduling campaigns, provider calls, SMS, billing, live AI, secrets, hard deletion, or live messaging enablement.
- `/dashboard/analytics`: renders a product-facing analytics workspace with tenant-scoped contact, campaign, scheduled-campaign, inbox, outbound-only message delivery, and usage totals backed by the existing analytics overview without report execution, exports, mutations, provider calls, Stripe calls, billing artifacts, live AI, SMS, secrets, or live feature enablement.
- `/dashboard/compliance`: renders a product-facing compliance readiness workspace with required profile fields, A2P status, runtime hard-gate blockers, and demo-safe live messaging state without registering A2P campaigns, provider calls, SMS, billing, live AI, secrets, or live feature enablement.
- `/settings/demo`: renders a read-only local demo operations checkpoint with seeded demo readiness, shared-inventory workflow links, local metrics, usage totals, and runtime gates without imports, campaign scheduling, worker execution, inbox replies, report execution, exports, mutations, provider calls, billing records, notifications, live feature enablement, or secrets.
- `/settings/operations`: renders a read-only local operations index with grouped existing operator surfaces, route names, static counts, and safety-boundary text without command execution, file inspection, API probes, mutations, exports, provider calls, billing records, notifications, live feature enablement, or secrets.
- `GET /api/settings/provider`: returns secret-safe provider readiness, live messaging blockers, and Twilio credential presence booleans.
- `PATCH /api/settings/provider`: stores local redacted Twilio credential readiness metadata without raw token persistence, provider calls, or live sends.
- `DELETE /api/settings/provider`: clears local Twilio credential readiness metadata without provider calls or live-send side effects.
- `GET /api/settings/provider/rotations`: lists recent local provider credential metadata history with optional allowlisted action filtering and bounded limits, without raw tokens, token fingerprints, provider calls, or live sends.
- `GET /api/settings/provider/rotations/export`: exports filtered local provider credential metadata history as CSV without raw tokens, token fingerprints, provider calls, billing records, notifications, live sends, or mutations.
- `/settings/provider`: renders provider details, a local-only credential metadata form, local metadata deletion, redacted readiness, rotation history, and a rotation CSV export link without provider calls or live-send controls.
- `/settings/numbers`: renders read-only local provider phone-number metadata, default-number status, capabilities, and safety boundary without provisioning, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/compliance`: renders a read-only compliance detail view with profile fields, checklist completeness, A2P status, live-message blockers, and local readiness audit export links without mutations, provider calls, billing records, notifications, live messaging, or secrets.
- `/settings/system`: renders a read-only operations snapshot with demo/live flags, runtime markers, queue backend metadata, worker poll limits, and API rate-limit policy without mutations, provider calls, billing records, notifications, live messaging, or secrets.
- `/settings/environment`: renders a read-only environment operations checkpoint with demo-safe defaults, allowlisted configuration categories, and derived runtime status without reading environment files, exposing raw values or secrets, mutating configuration, provider calls, billing records, notifications, live messaging, or live feature enablement.
- `/settings/health`: renders a read-only health operations checkpoint with the `GET /api/health` contract, demo-safe defaults, runtime blockers, and local operations links without executing probes, calling APIs, mutating records, exposing secrets, provider calls, billing records, notifications, live messaging, or live feature enablement.
- `/settings/runbook`: renders a read-only local operator checklist with validation, seed, worker, export, repair-loop commands, and links to current local admin views without executing commands, mutations, provider calls, billing records, notifications, live messaging, or secrets.
- `/settings/usage`: renders a read-only local usage and analytics view with tenant-scoped metrics, billing boundary status, and recent usage events without Stripe calls, billing provider artifacts, notifications, provider calls, live messaging, mutations, or secrets.
- `/settings/reports`: renders a read-only local reporting index with existing report links, tenant metrics, readiness signals, and safety-boundary text without executing reports, creating exports, mutating records, provider calls, billing records, notifications, live feature enablement, or secrets.
- `/settings/integrations`: renders a read-only integration operations view with existing provider, number, webhook, AI, billing, and notification boundaries without provider calls, prompt submission, billing artifacts, notifications, mutations, enqueueing, exports, secrets, or live feature enablement.
- `/settings/workflows`: renders a read-only workflow operations view with existing contacts, campaigns, queue, inbox, delivery, AI, usage, and reporting checkpoints without importing, scheduling, running workers, replying, retrying, submitting prompts, executing reports, exporting, mutating records, provider calls, billing records, notifications, live feature enablement, or secrets.
- `/settings/releases`: renders a read-only release operations view with local release checklist, protected gate expectations, seeded demo path, premerge metadata, release surface links, and safety-boundary text without executing commands, migrations, tests, browsers, git operations, deploys, mutations, provider calls, billing records, notifications, live feature enablement, logs, diffs, env values, or secrets.
- `/settings/campaigns`: renders a read-only local campaign operations view with campaign status, recipient counts, queue job status, and worker safety-boundary metadata without scheduling, running workers, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/queue`: renders a read-only local queue operations view with scheduled job timing, due/future status, payload validity, worker settings, queue backend metadata, and safety-boundary text without enqueueing jobs, running workers, mutating queue rows, calling Redis, calling providers, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/contacts`: renders a read-only local contact operations view with consent status, import status, tag counts, list counts, and recent contact/import metadata without importing contacts, mutating consent, changing labels, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/data`: renders a read-only local data operations view with tenant-scoped record totals, active/archived contact counts, import row totals, retention signals, recent archived contact metadata, and safety-boundary text without hard deletion, exports, provider calls, billing records, notifications, live AI, live messaging, mutations, or secrets.
- `/settings/audience`: renders a read-only local audience operations view with tag counts, list member counts, saved segment definitions, and segment update timestamps without changing memberships, evaluating segments for sends, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/templates`: renders a read-only local template operations view with template counts, variable names, campaign usage, and text previews without editing copy, rendering live outbound messages, scheduling campaigns, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/inbox`: renders a read-only local inbox operations view with conversation status, assignment counts, recent message/note counts, and inbox safety-boundary metadata without creating messages, assigning, resolving, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/webhooks`: renders a read-only local webhook operations view with Twilio route coverage, local stored webhook counts, provider/event-type summaries, recent idempotency keys, and safety-boundary metadata without replaying payloads, provider calls, outbound replies, message/contact mutation, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/delivery`: renders a read-only local delivery operations view with existing message direction counts, delivery status metadata, provider status labels, provider message ID presence, campaign/conversation context, and safety-boundary text without sends, retries, webhook replays, message mutation, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/team`: renders a read-only local team operations view with organization metadata, membership role/status counts, assigned conversation counts, authored-note counts, and team safety-boundary metadata without inviting users, role changes, suspensions, membership deletion, Clerk calls, email, notifications, provider calls, billing records, live messaging, mutations, or secrets.
- `/settings/billing`: renders a read-only local billing operations view with billing account status, live billing gate status, Stripe placeholder presence, usage totals, recent usage metadata, and billing safety-boundary text without Stripe calls, subscriptions, invoices, payment collection, card charges, email, notifications, provider calls, SMS, live billing, mutations, or secrets.
- `/settings/ai`: renders a read-only local AI operations view with selected AI provider state, fake-provider readiness, deterministic endpoint coverage, local AI usage totals, recent AI usage metadata, and safety-boundary text without prompt submission, live AI calls, paid model requests, billing artifacts, notifications, provider calls, SMS, live AI enablement, mutations, or secrets.
- `/settings/api`: renders a read-only local API operations view with static route inventory, route areas, read/write classification, external-impact classification, no-impact summary states, safety notes, and rate-limit policy without executing handlers, mutating records, provider calls, Stripe calls, live AI, notifications, SMS, email, secrets, or live feature enablement.
- `/settings/contracts`: renders a read-only local contract operations view with static contract inventory, drift controls, validation command references, and safety-boundary text without reading contract file contents, executing checks, scanning files, mutating records, provider calls, Stripe calls, live AI, notifications, SMS, email, secrets, or live feature enablement.
- `/settings/validation`: renders a read-only local validation operations view with static local gate inventory, repair signals, no-impact summary states, and safety-boundary text without executing commands, inspecting logs, scanning files, mutating records, provider calls, Stripe calls, live AI, notifications, SMS, email, secrets, or live feature enablement.
- `/settings/security`: renders a read-only local security operations view with demo-safe gate status, external-impact boundary status, API rate-limit policy, production override state, no-impact summary labels, documented secret-storage boundaries, and validation-command references without scanning files, exposing env values or secrets, mutating records, provider calls, Stripe calls, live AI, notifications, SMS, email, or live feature enablement.
- `/settings/notifications`: renders a read-only local notification operations view with email, in-app, SMS alert, and webhook notification boundaries, no-send controls, runtime gate status, no-impact summary states, and future provider-gate requirements without creating recipients, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, notifications, SMS, email, mutations, or secrets.
- `/settings/readiness-audit`: renders a read-only local go-live readiness audit view with tenant-scoped audit events, action/subject filters, local metadata, and bounded CSV export links without mutating audit events, exposing secrets, provider calls, billing records, live AI calls, notifications, SMS, email, or live feature enablement.

Post-MVP provider number foundation:

- `GET /api/settings/numbers`: lists local provider phone-number metadata.
- `POST /api/settings/numbers`: creates or updates local provider phone-number metadata without provisioning, provider calls, or live sends.

Post-MVP live-readiness audit foundation:

- `GET /api/settings/readiness-audit`: lists recent local go-live readiness audit events with bounded `limit`, allowlisted `action`, and allowlisted `subjectType` filters.
- `GET /api/settings/readiness-audit/export`: exports filtered local go-live readiness audit events as CSV using the same allowlisted filters without secrets, provider calls, billing records, notifications, live messaging, or mutations.

Post-MVP API rate limiting foundation:

- All `/api/*` routes are protected by a local in-memory rate limiter before route handlers run.
- Defaults are `API_RATE_LIMIT_ENABLED=true`, `API_RATE_LIMIT_MAX=120`, and `API_RATE_LIMIT_WINDOW_MS=60000`.
- Rate-limited responses return `429` plus retry/rate-limit headers and do not execute route-side effects.

Product API routes must be added to `contracts/CONTRACT-API.md` before implementation.
