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

### `GET /api/settings/numbers`

Returns tenant-scoped provider phone-number metadata for the current organization. This endpoint must not call Twilio or expose credentials.

### `POST /api/settings/numbers`

Creates or updates tenant-scoped provider phone-number metadata from `{ "phoneNumber": "+15555550123", "provider": "dummy", "capabilities": ["sms"], "isDefault": true }`. This endpoint is local metadata only; it must not provision numbers, validate live ownership, store secrets, enable live messaging, or send SMS.

Product endpoints must be specified here before implementation.
