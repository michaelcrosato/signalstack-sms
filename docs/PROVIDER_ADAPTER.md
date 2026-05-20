# Provider Adapter

The default messaging provider is `dummy`. The dummy provider is deterministic and performs no external network calls.

Twilio is planned as the first live provider after compliance and live-send gates exist. [DEFAULT]

`GET /api/settings/provider` exposes read-only provider readiness for the current organization. It reports credential presence booleans for Twilio but never returns account SID, auth token, phone number values, or other secrets. It does not enable live messaging or call providers.

`PATCH /api/settings/provider` records local Twilio credential readiness metadata for future go-live setup. The endpoint stores only redacted account/from-number values and a one-way auth-token fingerprint. It does not keep raw auth tokens, verify credentials with Twilio, enable live messaging, or send SMS.

`DELETE /api/settings/provider` clears local Twilio credential readiness metadata. It records an audit event but does not call Twilio, revoke credentials, mutate provider accounts, enable live messaging, or send SMS.

`GET /api/settings/provider/rotations` lists recent local provider credential metadata history. It exposes only redacted identifiers, last-four hints, configured booleans, actions, actor IDs, and timestamps. It never returns raw auth tokens or token fingerprints, never validates credentials with Twilio, and never enables live messaging.

`/settings/provider` includes a local-only Twilio metadata form. Submitted auth tokens are sent only to the local metadata API, then the page refreshes redacted readiness and rotation history. The page does not display raw tokens, expose token fingerprints, validate credentials with Twilio, revoke provider-side credentials, enable live messaging, or send SMS.

`GET /api/settings/numbers` and `POST /api/settings/numbers` manage local provider phone-number metadata for demo and future setup UI. They do not provision provider numbers, verify ownership, store credentials, enable live messaging, or send SMS.
