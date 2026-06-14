# Webhooks

Twilio webhook foundations are implemented for inbound message and delivery-status callbacks:

- `POST /api/webhooks/twilio/inbound`
- `POST /api/webhooks/twilio/status`

Both handlers accept string-only form payloads, return `400` for malformed or unsupported form bodies before signature validation, reject non-string form parts and duplicate form field names before signature validation, and validate `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN`, the exact request URL, and all form parameters, including unknown provider fields. Invalid or unsigned requests return `403`.

Valid webhook payloads are stored in `WebhookEvent` with the full raw form payload, including unknown provider fields. Duplicate idempotency keys within the current organization return `204` without repeating local message mutations; concurrent duplicate create attempts that hit the tenant-scoped unique index are re-read and handled as duplicates. Delivery-status idempotency keys normalize provider status casing and surrounding whitespace before storage so provider retries cannot create duplicate local events only by changing status formatting. Inbound webhooks reject whitespace-only bodies while preserving nonblank body text exactly for local message creation.

Inbound webhooks create local inbox messages through the existing demo-safe inbound path, so STOP updates local consent and HELP is recorded without automatic provider replies. Message ID and status normalization falls back from blank modern Twilio fields to nonblank legacy aliases before idempotency keys are derived. Status webhooks update matching local messages by provider message ID with provider status, optional error code, and delivered/failed timestamps; terminal delivered versus failed/undelivered transitions clear the opposite terminal timestamp to avoid stale delivery metadata.

Webhook handlers must never send SMS replies, email, notifications, billing events, live AI calls, or provider mutations.
