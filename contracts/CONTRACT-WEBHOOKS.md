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
- Valid and duplicate events return `204`.
- Raw payloads are stored in `WebhookEvent.rawPayload` without dropping unknown provider fields.
- Concurrent duplicate webhook creates that lose the tenant-scoped unique-key race are re-read and treated as duplicates before local message/contact/delivery mutations.
- Delivery-status idempotency keys normalize provider message ID whitespace, provider status casing/whitespace, provider error-code whitespace, and blank modern/legacy field alias fallback before local storage.
- Inbound webhook idempotency keys normalize provider message ID whitespace and blank modern/legacy message ID alias fallback before local storage, inbound `From`/`To` addresses are trimmed before local contact/message creation, and whitespace-only inbound bodies are rejected without trimming stored nonblank body text.
- Inbound webhooks may create local inbox messages and local STOP/HELP consent effects through the same demo-safe inbound path.
- Status webhooks may update matching local `Message` rows within the current tenant by `providerMessageId` with provider status, provider error code, and delivered/failed timestamps. Delivered transitions clear stale failed timestamps; failed or undelivered transitions clear stale delivered timestamps.

## Post-MVP Local Webhook Operations

`/settings/webhooks` renders the local webhook safety boundary. It may display Twilio route coverage, stored local webhook event counts, provider/event-type summaries, recent idempotency keys, and received timestamps.

This view is read-only. It must not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, expose secrets, send notifications, create billing records, send SMS, or enable live messaging.
- Webhook handlers must not send SMS replies, email, notifications, billing events, or provider mutations.
