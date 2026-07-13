# Provider Adapter Contract

Owner: integrations-ai.

Default provider is `dummy`. Live provider calls are blocked unless `LIVE_MESSAGING_ENABLED=true` and future compliance gates pass.

## M4 provider control plane

The provider factory accepts only `dummy` or `twilio`. Its frozen interface covers account verification and
health; number and messaging-service discovery; SMS/MMS create/fetch types; provider status/error/retry
normalization; exact inbound/status signature validation; account/number/service/capability identifiers;
and bounded injectable transport. The M4 Twilio create/fetch operations are contract/fixture surfaces only:
no M4 route or worker may call message creation.

Provider Auth Tokens are versioned AES-256-GCM envelopes under a provider-domain key derived from the
server-only `SECRETS_MASTER_KEY`. AAD binds the tenant, provider, account, exact external account ID,
credential-secret version, lookup hash, and fingerprint. The Auth Token never persists in plaintext or
enters responses, logs, errors, audit, exports, HTML, page props, or caches. Twilio Account SID is stored as
the tenant account's exact non-secret `externalAccountId` but is redacted in every outward surface. Safe
fingerprints and routing hashes are domain-separated keyed HMACs. Rotation
verifies the replacement before atomic activation; revocation is immediate and never erases history.

Twilio verification/discovery/health is allowed only from an explicit same-origin ADMIN operation with a
bounded abort signal. Tests and defaults use deterministic transports and never contact Twilio. Verified
discovery/import may persist only resources returned for the same active account/credential generation;
import does not purchase, release, port, configure, or otherwise mutate a provider resource.

`dummy` implements the complete interface without environment reads, network access, time-dependent IDs,
or external effects. General live messaging remains blocked until M5's durable-before-provider path and the
central hard gate are complete.

## M5 durable direct-message create and fetch

Only an explicitly authorized direct worker may invoke Twilio message create. Public/inbox acceptance,
page rendering, health/readiness, builds, tests, seeds, default workers, and customer/provider webhook
delivery never call create. Immediately before mutation, the worker must own a durable `MessageAttempt` at
its committed call frontier and must pass `evaluateMessagingHardGate` plus exact M4 provider account,
credential-generation, owned-number, capability, and organization checks.

General M5 operations decrypt the active credential from the tenant provider account store. Installation-
global `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, sender, and messaging-service environment values remain
limited to the isolated live-test exception below and cannot authorize or supply the general outbox. The
selected sender is the attempt's exact verified owned number. The adapter retains messaging-service types,
but dynamic service sender-pool execution is deferred until its callback routing and throughput controls are
completed with M7.

The bounded Twilio create request contains only the stored account credential, normalized destination, exact
owned sender, immutable body/media snapshot, and correlated HTTPS status callback URL. Media is zero to ten
unique HTTPS URLs and requires verified MMS capability; body-only requests are SMS. The adapter uses a
bounded abort timeout and must never log or return authorization headers, tokens, complete provider
responses, message content, callback HMAC, or exact outward account identifiers.

The status callback URL contains the immutable attempt correlation identifier plus a domain-separated
master-key HMAC. The HMAC is recomputed for validation and is never stored or logged. Twilio signature
validation covers the complete URL and all form parameters. A create result may be accepted only when its
provider account, SID, destination, sender, and messaging-service evidence match the attempt; mismatched or
malformed success is possible-impact ambiguity.

Create result normalization is fixed:

- accepted, queued, sending, sent, or unknown with a valid SID completes the attempt as `SUCCEEDED` and
  projects the message to `SENT`; delivered projects `DELIVERED`;
- immediate failed, undelivered, or canceled results are definitive `FAILED` and are never automatically
  resent;
- only a validated no-impact retryable failure may authorize the queue layer to create a successor; and
- network/timeout, create-side 5xx, malformed/mismatched success, SID-bearing error, success without SID,
  local result-persistence uncertainty, and any unclassified possible-impact result are `AMBIGUOUS` and
  authorize no automatic successor.

The adapter's retry classification describes impact certainty; it never retries internally. SignalStack
does not assume Twilio message create has an idempotency primitive. Each external create belongs to exactly
one durable attempt, and every successor is created by the guarded queue state machine.

Provider fetch is reconciliation only. It is allowed for an ambiguous/unfinished attempt with a known SID
and current exact account credential. The fetched account, SID, destination, and sender must match durable
attempt evidence before state changes. Fetch may converge to `SENT`, `DELIVERED`, or `FAILED`; any fetch
failure or mismatch preserves ambiguity and can never cause message create.

`dummy` remains the default, implements the same create/fetch normalization deterministically, reads no
environment secret, and performs no network effect. Demo/local acceptance may finalize its durable attempt
transactionally. Selecting `dummy` remains a blocker for live Twilio readiness, not a reason to omit outbox
evidence.

Post-MVP live test SMS exception:

- `/api/demo/live-test-sms` is a narrow investor-demo exception for one allowlisted Twilio test SMS.
- It must require `LIVE_TEST_SMS_ENABLED=true`, `LIVE_MESSAGING_ENABLED=true`, `MESSAGING_PROVIDER=twilio`, complete Twilio environment credentials, an allowlisted recipient, an exact confirmation phrase, and a constant-time match against a server-only `LIVE_TEST_SMS_OPERATOR_TOKEN` of 32-256 characters before any Twilio call.
- It must not use locally stored provider credential metadata for live sends; raw Twilio credentials must come from environment variables only.
- It must not enable campaign sends, queue workers, bulk sends, billing, live AI, notification delivery, non-allowlisted recipients, or provider credential display. Public readiness exposes only configured counts, last-four hints, booleans, and blocker codes; full allowlist/from values, the confirmation phrase, and the operator token must never be rendered, prefilled, logged, persisted, or returned.
- Every request must include a client-generated UUID `requestId` and an operator-entered token. Operator authorization is required before both new-send reservation and existing-request lookup. For a new tenant/request key, all live, provider, credential, allowlist, body, confirmation, and operator gates must pass before the server reserves anything or calls Twilio.
- The reservation must atomically create both the tenant-unique `(orgId, idempotencyKey)` `Message` and a `LIVE_TEST_SMS_RESERVED` readiness audit tied to that message. Audit metadata stores only an HMAC-SHA-256 fingerprint of the normalized actor/recipient/body tuple keyed by the server-side operator secret, original recipient/from last-four, and body length; it must not store the full recipient, full body, operator token, or provider credentials.
- After operator authorization, an existing tenant/request key must be looked up before current live-state gates so later live flag, allowlist, or provider-credential changes do not hide its stored outcome. Matching actor and HMAC-bound requests return the stored sent, failed, or reserved/pending outcome and original audit-backed last-four without another Twilio call, including after a concurrent reservation race.
- Reusing the same tenant/request key with a different actor, normalized recipient, or trimmed body, or without valid reservation evidence, returns `409` and must not call Twilio.
- Successful nonterminal sends must update the reserved message with the provider identifier and normalized status and create local audit evidence without storing raw auth tokens. A validated 4xx Twilio rejection with an integer provider error code and no provider SID, plus immediate terminal `failed`, `undelivered`, or `canceled` statuses, marks the reservation failed with a secret-safe error code. Network errors, bounded timeouts, 5xx/other non-4xx responses, a 4xx response without that validated error shape, any non-2xx response carrying a provider SID, successful responses without a provider identifier, and provider-result persistence failures are ambiguous: they leave the durable reservation pending and return `202`, so an exact retry can inspect it but never resend.
- `LIVE_TEST_SMS_TIMEOUT_MS` is clamped between 1000 and 10000 milliseconds, with a 5000 millisecond default, and every Twilio create request must use an abort signal.
- Twilio response status values must be trimmed and lowercased before local message rows, readiness audit metadata, or API responses consume them; blank or missing statuses default to `queued`.
- The general campaign/live-worker compliance profile, per-contact consent, quiet-hours, and `APPROVED` A2P hard gate does not authorize this isolated human-approved demo exception, which has no campaign/contact input and runs in the demo workspace. Passing this exception's narrower operator, allowlist, provider, credential, confirmation, reservation, and idempotency controls is not evidence of campaign or production readiness; all broader live-send paths remain blocked by their full compliance gates.

Post-MVP paid Twilio phone lookup boundary:

- Contact phone validation is local-only by default. Unset, empty, or exactly `false` `LIVE_LOOKUP_ENABLED` values must not call Twilio.
- A paid Twilio Lookup request requires exact `LIVE_LOOKUP_ENABLED=true`, exact `LIVE_LOOKUP_COST_ACK=true`, complete `TWILIO_ACCOUNT_SID` plus `TWILIO_AUTH_TOKEN` environment credentials, and a constant-time match between the dedicated `x-signalstack-lookup-token` request header and a server-only `LIVE_LOOKUP_OPERATOR_TOKEN` of 32-256 characters. The deterministic demo membership role is not sufficient authorization for a paid call.
- Operator authorization must fail closed before any provider fetch. The lookup token must never be rendered, prefilled, logged, persisted, returned, or forwarded to Twilio.
- Malformed enablement, invalid or missing operator authorization, missing acknowledgement, missing credentials, provider errors, malformed provider responses, network failures, and timeouts fail closed without creating or updating the contact.
- A successful Twilio response must contain a `phone_number` that locally normalizes to exactly the requested E.164 number. A missing, invalid, or mismatched response number is a malformed response and fails closed.
- `LIVE_LOOKUP_TIMEOUT_MS` is clamped between 250 and 10000 milliseconds, with a 3000 millisecond default, and every live request must use an abort signal.
- CSV contact imports always use local phone normalization and validation. Import parsing must ignore live lookup configuration and must never call Twilio once per row or in bulk.
- Lookup failures and logs must not expose raw credentials or provider response messages.

Post-MVP provider settings foundation:

- `GET /api/settings/provider` is read-only and secret-safe.
- Provider readiness may expose credential presence booleans only.
- Provider readiness must not return credential values, mutate settings, enable live messaging, or call Twilio.

Pre-M4 provider credential metadata foundation (superseded by SPEC-032):

- `PATCH /api/settings/provider` may store local Twilio readiness metadata.
- Stored metadata may include redacted account/from-number fields and one-way token fingerprints only.
- Raw auth tokens must not be stored, returned, or logged. Under M4, validated credentials are persisted
  only as authenticated-encryption envelopes and may be decrypted only for explicit verification,
  discovery, health, signature validation, or a later separately gated M5 provider operation.
- Credential metadata does not enable live messaging and must record a local readiness audit event.
- Deleting credential metadata only clears local readiness rows; it must not call Twilio, revoke live credentials, or change live messaging flags.

M4 provider credential lifecycle and audit:

- M4 configure, verify, rotate, revoke, health, discovery, import, default, and disable operations append
  secret-free canonical `IntegrationAuditEvent` rows. Existing `ProviderCredential` and
  `ProviderCredentialRotation` rows remain unverified/display-only legacy metadata and never authorize M4.
- Legacy rotation-history API responses may expose only provider name, redacted account/from-number values,
  last-four hints, configured booleans, allowlisted legacy actions, actor IDs, and timestamps under bounded
  filters. They must not expose raw tokens, token fingerprints, provider credentials, or provider
  verification results, and they must not be described as M4 ownership evidence.
- Rotation verifies a replacement credential before atomic activation; local revocation disables authority
  without claiming provider-side revocation. History remains immutable and secret-free. No lifecycle action
  enables live messaging or sends SMS.

M4 provider credential UI:

- `/settings/provider` may submit an unprefilled credential only to a same-origin ADMIN verification or
  rotation operation. The control resets after submission and the server never returns plaintext.
- The UI may display only safe account/credential/ownership/health DTOs. It must not expose envelope fields,
  lookup hashes, raw provider errors, or imply that verification enables sending.
- Delete/revoke actions revoke local authority and retain history; they must not claim or perform
  provider-side credential revocation.

M4 provider account, number, and messaging-service ownership:

- Multiple provider accounts may belong to one organization. Provider account identifiers, verified active
  phone-number ownership, and messaging-service identifiers are globally unambiguous.
- Twilio live number/service rows may be imported only from a fresh verified discovery for the same account
  and credential generation. Caller-asserted Twilio ownership is rejected.
- `GET /api/settings/numbers` and `POST /api/settings/numbers` remain dummy/local metadata unless they
  delegate to the verified account import boundary.
- The consolidated `/settings` readiness view renders existing local phone-number metadata; `/settings/provider` retains focused credential-readiness detail.
- Number metadata may record provider name, capabilities, local status, and default selection.
- Legacy number metadata must not be treated as proof that a live Twilio number is owned, provisioned, or
  safe to send from. Only M4 verified import produces live ownership evidence.
- The consolidated number summary must not provision provider numbers, verify ownership, mutate metadata, expose credentials, enable live messaging, or send SMS.
