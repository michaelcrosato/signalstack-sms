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
- Inbound webhooks may create local inbox messages and local STOP/HELP consent effects through the same demo-safe inbound path.
- Status webhooks may update matching local `Message` rows by `providerMessageId` with provider status, provider error code, and delivered/failed timestamps.
- Webhook handlers must not send SMS replies, email, notifications, billing events, or provider mutations.
