# Provider Adapter Contract

Owner: integrations-ai.

Default provider is `dummy`. Live provider calls are blocked unless `LIVE_MESSAGING_ENABLED=true` and future compliance gates pass.

Required interface: provider name, deterministic send input, send result, and idempotency key.

Milestone 6 central gate requirements:

- Provider-backed send entrypoints must call `evaluateMessagingHardGate` before any external provider mutation.
- `dummy` remains the default provider and is considered a blocker for live messaging readiness.
- A complete compliance profile and `APPROVED` A2P status are necessary but not sufficient; demo mode and live flags must also permit external impact.

Post-MVP provider settings foundation:

- `GET /api/settings/provider` is read-only and secret-safe.
- Provider readiness may expose credential presence booleans only.
- Provider readiness must not return credential values, mutate settings, enable live messaging, or call Twilio.
