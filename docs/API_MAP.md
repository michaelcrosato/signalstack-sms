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

- `GET /api/settings/provider`: returns secret-safe provider readiness, live messaging blockers, and Twilio credential presence booleans.
- `PATCH /api/settings/provider`: stores local redacted Twilio credential readiness metadata without raw token persistence, provider calls, or live sends.
- `DELETE /api/settings/provider`: clears local Twilio credential readiness metadata without provider calls or live-send side effects.
- `GET /api/settings/provider/rotations`: lists recent local provider credential metadata history with optional allowlisted action filtering and bounded limits, without raw tokens, token fingerprints, provider calls, or live sends.
- `/settings/provider`: renders provider details, a local-only credential metadata form, local metadata deletion, redacted readiness, and rotation history without provider calls or live-send controls.

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
