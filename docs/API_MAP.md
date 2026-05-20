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
- `POST /api/contacts/imports`: imports contacts from local CSV text.

Milestone 3:

- `GET /api/templates`: lists message templates.
- `POST /api/templates`: creates or upserts a message template.
- `GET /api/campaigns`: lists campaigns.
- `POST /api/campaigns`: creates a draft campaign.
- `GET /api/campaigns/:campaignId`: reads a tenant-scoped campaign.
- `PATCH /api/campaigns/:campaignId`: updates a draft campaign.
- `POST /api/campaigns/:campaignId/preflight`: checks recipients without sending.

Milestone 4:

- `POST /api/campaigns/:campaignId/schedule`: stores a queued scheduled-campaign job after preflight.
- `POST /api/campaigns/:campaignId/cancel`: cancels queued jobs and pauses the campaign.

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

Milestone 6:

- `GET /api/settings/compliance`: returns compliance profile and hard-gate checklist.
- `PATCH /api/settings/compliance`: updates compliance readiness metadata.

Milestone 7:

- `POST /api/ai/campaign-copy`: returns fake campaign copy variants.
- `POST /api/ai/reply-suggestion`: returns a fake reply suggestion.
- `POST /api/ai/conversation-summary`: returns a fake conversation summary.
- `POST /api/ai/lead-qualification`: returns fake lead qualification.

Milestone 8:

- `GET /api/analytics/overview`: returns tenant-scoped aggregate analytics.
- `GET /api/billing/usage`: returns local billing metadata and usage totals.
- `POST /api/billing/usage`: records a local usage event only.

Milestone 9:

- `GET /demo`: renders the investor demo console backed by seeded local data.

Post-MVP webhook foundation:

- `POST /api/webhooks/twilio/inbound`: validates a Twilio form webhook signature, stores raw inbound payloads idempotently, and creates a local inbound inbox message without sending replies.
- `POST /api/webhooks/twilio/status`: validates a Twilio form webhook signature and stores raw delivery-status payloads idempotently without provider callbacks.

Post-MVP provider settings foundation:

- `/`: renders a static local launch dashboard with demo-safe defaults and links to existing local-only admin/demo views without database access, mutations, provider calls, billing artifacts, notifications, live messaging, or secrets.
- `GET /api/settings/provider`: returns secret-safe provider readiness, live messaging blockers, and Twilio credential presence booleans.
- `PATCH /api/settings/provider`: stores local redacted Twilio credential readiness metadata without raw token persistence, provider calls, or live sends.
- `DELETE /api/settings/provider`: clears local Twilio credential readiness metadata without provider calls or live-send side effects.
- `GET /api/settings/provider/rotations`: lists recent local provider credential metadata history with optional allowlisted action filtering and bounded limits, without raw tokens, token fingerprints, provider calls, or live sends.
- `GET /api/settings/provider/rotations/export`: exports filtered local provider credential metadata history as CSV without raw tokens, token fingerprints, provider calls, billing records, notifications, live sends, or mutations.
- `/settings/provider`: renders provider details, a local-only credential metadata form, local metadata deletion, redacted readiness, rotation history, and a rotation CSV export link without provider calls or live-send controls.
- `/settings/numbers`: renders read-only local provider phone-number metadata, default-number status, capabilities, and safety boundary without provisioning, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/compliance`: renders a read-only compliance detail view with profile fields, checklist completeness, A2P status, live-message blockers, and local readiness audit export links without mutations, provider calls, billing records, notifications, live messaging, or secrets.
- `/settings/system`: renders a read-only operations snapshot with demo/live flags, runtime markers, queue backend metadata, worker poll limits, and API rate-limit policy without mutations, provider calls, billing records, notifications, live messaging, or secrets.
- `/settings/runbook`: renders a read-only local operator checklist with validation, seed, worker, export, and repair-loop commands without executing commands, mutations, provider calls, billing records, notifications, live messaging, or secrets.
- `/settings/usage`: renders a read-only local usage and analytics view with tenant-scoped metrics, billing boundary status, and recent usage events without Stripe calls, billing provider artifacts, notifications, provider calls, live messaging, mutations, or secrets.
- `/settings/campaigns`: renders a read-only local campaign operations view with campaign status, recipient counts, queue job status, and worker safety-boundary metadata without scheduling, running workers, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/contacts`: renders a read-only local contact operations view with consent status, import status, tag counts, list counts, and recent contact/import metadata without importing contacts, mutating consent, changing labels, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/audience`: renders a read-only local audience operations view with tag counts, list member counts, saved segment definitions, and segment update timestamps without changing memberships, evaluating segments for sends, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/templates`: renders a read-only local template operations view with template counts, variable names, campaign usage, and text previews without editing copy, rendering live outbound messages, scheduling campaigns, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/inbox`: renders a read-only local inbox operations view with conversation status, assignment counts, recent message/note counts, and inbox safety-boundary metadata without creating messages, assigning, resolving, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/webhooks`: renders a read-only local webhook operations view with Twilio route coverage, local stored webhook counts, provider/event-type summaries, recent idempotency keys, and safety-boundary metadata without replaying payloads, provider calls, outbound replies, message/contact mutation, billing records, notifications, live messaging, mutations, or secrets.
- `/settings/team`: renders a read-only local team operations view with organization metadata, membership role/status counts, assigned conversation counts, authored-note counts, and team safety-boundary metadata without inviting users, role changes, suspensions, membership deletion, Clerk calls, email, notifications, provider calls, billing records, live messaging, mutations, or secrets.
- `/settings/billing`: renders a read-only local billing operations view with billing account status, live billing gate status, Stripe placeholder presence, usage totals, recent usage metadata, and billing safety-boundary text without Stripe calls, subscriptions, invoices, payment collection, card charges, email, notifications, provider calls, SMS, live billing, mutations, or secrets.
- `/settings/ai`: renders a read-only local AI operations view with selected AI provider state, fake-provider readiness, deterministic endpoint coverage, local AI usage totals, recent AI usage metadata, and safety-boundary text without prompt submission, live AI calls, paid model requests, billing artifacts, notifications, provider calls, SMS, live AI enablement, mutations, or secrets.
- `/settings/api`: renders a read-only local API operations view with static route inventory, route areas, read/write classification, external-impact classification, safety notes, and rate-limit policy without executing handlers, mutating records, provider calls, Stripe calls, live AI, notifications, SMS, email, secrets, or live feature enablement.
- `/settings/security`: renders a read-only local security operations view with demo-safe gate status, external-impact boundary status, API rate-limit policy, production override state, documented secret-storage boundaries, and validation-command references without scanning files, exposing env values or secrets, mutating records, provider calls, Stripe calls, live AI, notifications, SMS, email, or live feature enablement.

Post-MVP provider number foundation:

- `GET /api/settings/numbers`: lists local provider phone-number metadata.
- `POST /api/settings/numbers`: creates or updates local provider phone-number metadata without provisioning, provider calls, or live sends.

Post-MVP live-readiness audit foundation:

- `GET /api/settings/readiness-audit`: lists recent local go-live readiness audit events with bounded `limit`, `action`, and `subjectType` filters.
- `GET /api/settings/readiness-audit/export`: exports filtered local go-live readiness audit events as CSV without secrets, provider calls, billing records, notifications, live messaging, or mutations.

Post-MVP API rate limiting foundation:

- All `/api/*` routes are protected by a local in-memory rate limiter before route handlers run.
- Defaults are `API_RATE_LIMIT_ENABLED=true`, `API_RATE_LIMIT_MAX=120`, and `API_RATE_LIMIT_WINDOW_MS=60000`.
- Rate-limited responses return `429` plus retry/rate-limit headers and do not execute route-side effects.

Product API routes must be added to `contracts/CONTRACT-API.md` before implementation.
