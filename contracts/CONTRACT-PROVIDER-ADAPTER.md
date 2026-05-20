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

Post-MVP provider credential metadata foundation:

- `PATCH /api/settings/provider` may store local Twilio readiness metadata.
- Stored metadata may include redacted account/from-number fields and one-way token fingerprints only.
- Raw auth tokens must not be stored, returned, logged, or used for provider calls.
- Credential metadata does not enable live messaging and must record a local readiness audit event.
- Deleting credential metadata only clears local readiness rows; it must not call Twilio, revoke live credentials, or change live messaging flags.

Post-MVP provider credential rotation history:

- Credential metadata configuration, rotation, and deletion must append local rotation-history rows.
- Rotation-history API responses may expose action labels, provider name, redacted account/from-number values, last-four hints, configured booleans, actor IDs, and timestamps.
- Rotation-history filtering must use allowlisted action labels and bounded result limits.
- Rotation-history API responses must not expose raw tokens, token fingerprints, provider credentials, or provider verification results.
- Rotation history must not call Twilio, revoke provider credentials, enable live messaging, or send SMS.

Post-MVP provider credential metadata UI:

- `/settings/provider` may submit Twilio credential metadata to the existing local-only provider settings API.
- The UI must never render raw auth tokens after submission, expose token fingerprints, call Twilio, enable live messaging, or imply credential verification.
- Delete actions clear only local metadata through `DELETE /api/settings/provider`; they must not revoke provider-side credentials or mutate live provider accounts.
- Clear actions require an explicit local-only confirmation in the UI so operators do not confuse metadata clearing with provider-side revocation.

Post-MVP provider number foundation:

- `GET /api/settings/numbers` and `POST /api/settings/numbers` manage local phone-number metadata only.
- Number metadata may record provider name, capabilities, local status, and default selection.
- Number metadata must not be treated as proof that a live Twilio number is owned, provisioned, or safe to send from.
