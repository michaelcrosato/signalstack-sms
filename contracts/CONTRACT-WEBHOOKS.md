# Webhooks Contract

Owner: integrations-ai.

Twilio inbound and status webhooks validate `X-Twilio-Signature`, preserve raw provider payloads, and are idempotent before any mutation.

Implemented foundations:

- `POST /api/webhooks/twilio/inbound`
- `POST /api/webhooks/twilio/status`

Rules:

- Webhook requests are `application/x-www-form-urlencoded`.
- Signature validation uses the exact request URL, all received parameters, and `TWILIO_AUTH_TOKEN`.
- Missing or invalid signatures return `403`.
- Missing required normalized fields return `400`.
- Valid and duplicate events return `204`.
- Raw payloads are stored in `WebhookEvent.rawPayload` without dropping unknown provider fields.
- Delivery-status idempotency keys normalize provider status casing and surrounding whitespace before local storage.
- Inbound webhooks may create local inbox messages and local STOP/HELP consent effects through the same demo-safe inbound path.
- Status webhooks may update matching local `Message` rows by `providerMessageId` with provider status, provider error code, and delivered/failed timestamps.

## Post-MVP Local Webhook Operations

`/settings/webhooks` renders the local webhook safety boundary. It may display Twilio route coverage, stored local webhook event counts, provider/event-type summaries, recent idempotency keys, and received timestamps.

This view is read-only. It must not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, expose secrets, send notifications, create billing records, send SMS, or enable live messaging.
- Webhook handlers must not send SMS replies, email, notifications, billing events, or provider mutations.
