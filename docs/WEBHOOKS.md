# Webhooks

Twilio webhook foundations are implemented for inbound message and delivery-status callbacks:

- `POST /api/webhooks/twilio/inbound`
- `POST /api/webhooks/twilio/status`

Both handlers validate `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN`, the exact request URL, and all form parameters. Invalid or unsigned requests return `403`.

Valid webhook payloads are stored in `WebhookEvent` with the full raw form payload, including unknown provider fields. Duplicate idempotency keys return `204` without repeating local message mutations.

Inbound webhooks create local inbox messages through the existing demo-safe inbound path, so STOP updates local consent and HELP is recorded without automatic provider replies. Status webhooks are recorded only; message status transition logic remains a future worker/provider slice.

Webhook handlers must never send SMS replies, email, notifications, billing events, live AI calls, or provider mutations.
