# Provider Adapter

The default messaging provider is `dummy`. The dummy provider is deterministic and performs no external network calls.

Twilio is planned as the first live provider after compliance and live-send gates exist. [DEFAULT]

`GET /api/settings/provider` exposes read-only provider readiness for the current organization. It reports credential presence booleans for Twilio but never returns account SID, auth token, phone number values, or other secrets. It does not enable live messaging or call providers.
