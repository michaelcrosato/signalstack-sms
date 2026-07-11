# Webhooks Contract

Owner: integrations-ai.

Twilio inbound and status webhooks validate `X-Twilio-Signature`, preserve raw provider payloads, and are idempotent before any mutation.

Implemented foundations:

- `POST /api/webhooks/twilio/inbound`
- `POST /api/webhooks/twilio/status`

Rules:

- Webhook requests are `application/x-www-form-urlencoded`.
- Malformed or unsupported form bodies return `400` before signature validation, current-org lookup, webhook-event storage, or local message/delivery mutation.
- Non-string form parts are rejected before signature validation; Twilio webhook helpers must not coerce file/blob parts into filenames or trusted payload fields.
- Duplicate form field names are rejected before signature validation; Twilio webhook helpers must not collapse repeated fields into an ambiguous last-value payload.
- Signature validation uses the exact request URL, all received parameters including unknown provider fields, and `TWILIO_AUTH_TOKEN`.
- Missing or invalid signatures return `403`.
- Missing required normalized fields return `400`.
- A valid event whose request acquires the processing lease returns `204` after local completion. An already processed duplicate also returns `204`. An unprocessed duplicate with a live lease returns `409` with an advisory `Retry-After` and performs no downstream mutation. Automatic retry is an upstream webhook-configuration concern and must not be assumed from the response header alone.
- Raw payloads are stored in `WebhookEvent.rawPayload` without dropping unknown provider fields.
- Every unprocessed webhook must atomically acquire a tenant-scoped, expiring processing lease with a unique owner token before it may run local message/contact/delivery mutations. A request that loses the create or claim race returns the in-progress `409` path without downstream mutation so a later provider retry is not suppressed if the owner fails.
- Claim owner tokens are generated internally; webhook payloads cannot supply them and responses do not expose them.
- `processedAt` may be set only by the lease owner after downstream work completes, and completion clears the lease. Downstream failure releases that owner's claim for immediate retry. If a process exits without releasing, a provider retry may recover the event only after the lease expires.
- Lease ownership narrows concurrent processing to one active request; downstream writes remain independently idempotent because stale-lease recovery can retry work after an interrupted process.
- Delivery-status idempotency keys normalize provider message ID whitespace, provider status casing/whitespace, provider error-code whitespace, and blank modern/legacy field alias fallback before local storage.
- Inbound webhook idempotency keys normalize provider message ID whitespace and blank modern/legacy message ID alias fallback before local storage, inbound `From`/`To` addresses are trimmed before local contact/message creation, and whitespace-only inbound bodies are rejected without trimming stored nonblank body text.
- Inbound webhooks may create local inbox messages and local STOP/HELP consent effects through the same demo-safe inbound path.
- Status webhooks may update matching local `Message` rows within the current tenant by `providerMessageId` with provider status, provider error code, and delivered/failed timestamps. Updates use an atomic current-status and terminal-timestamp guard: known statuses advance monotonically, terminal success and failure states cannot overwrite each other, stale earlier callbacks are ignored, and previously unknown provider statuses may be retained only before terminal delivery evidence exists. Delivered transitions clear stale failed timestamps; the shared terminal-failure vocabulary (`failed`, `undelivered`, and `canceled`) clears stale delivered timestamps, sets `failedAt`, and drives failure metrics and local delivery reporting consistently.
- A status callback that arrives before its tenant-scoped `Message` exists remains unprocessed: the handler releases its claim and returns `409` with advisory `Retry-After` instead of permanently acknowledging delivery evidence it could not apply.

## Post-MVP Local Webhook Operations

The consolidated `/settings` readiness view renders the local webhook safety boundary. It may display Twilio route coverage, stored local webhook event counts, provider/event-type summaries, recent idempotency keys, and received timestamps; there is no dedicated webhook settings page.

This view is read-only. It must not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, expose secrets, send notifications, create billing records, send SMS, or enable live messaging.
- Webhook handlers must not send SMS replies, email, notifications, billing events, or provider mutations.
