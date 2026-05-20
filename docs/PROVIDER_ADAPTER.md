# Provider Adapter

The default messaging provider is `dummy`. The dummy provider is deterministic and performs no external network calls.

Twilio is planned as the first live provider after compliance and live-send gates exist. [DEFAULT]

`GET /api/settings/provider` exposes read-only provider readiness for the current organization. It reports credential presence booleans for Twilio but never returns account SID, auth token, phone number values, or other secrets. It does not enable live messaging or call providers.

`PATCH /api/settings/provider` records local Twilio credential readiness metadata for future go-live setup. The endpoint stores only redacted account/from-number values and a one-way auth-token fingerprint. It does not keep raw auth tokens, verify credentials with Twilio, enable live messaging, or send SMS.

`GET /api/settings/numbers` and `POST /api/settings/numbers` manage local provider phone-number metadata for demo and future setup UI. They do not provision provider numbers, verify ownership, store credentials, enable live messaging, or send SMS.
