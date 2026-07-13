# Webhooks

## Customer event delivery (M3 complete)

SignalStack's outbound customer-webhook platform is separate from the inbound Twilio callbacks below. The
frozen protocol is in `contracts/CONTRACT-WEBHOOKS.md` and
`plan/specs/SPEC-031-public-integrations.md`. Endpoint administration, durable worker ownership/recovery,
replay/rotation, receiver examples, database isolation, and the literal Next HTTP + receiver-socket exit path
are implemented and verified. None of this enables live SMS/MMS transport.

Tenant domain transactions atomically create an immutable allowlisted event and deliveries for matching
active subscriptions. Supported families are contact create/update/archive; message accepted/sent/delivered/
failed/received/status-updated; campaign scheduled/started/completed/failed/canceled; conversation created/
updated; and endpoint disabled. Delivery is at least once, and receivers deduplicate the immutable event ID.

Endpoints are immutable canonical public HTTPS URLs without userinfo, query strings, or fragments. Every
attempt re-resolves DNS, rejects mixed or non-public address sets, pins a vetted address while preserving TLS
hostname validation, and follows no redirects. Each exact raw JSON body is HMAC-SHA-256 signed with a
one-time `whsec_` secret under timestamped `X-SignalStack-*` headers, including the pinned
`X-SignalStack-Secret-Version`. At-rest secrets are AES-256-GCM wrapped under `SECRETS_MASTER_KEY`; only safe
fingerprints are listable outside the logical idempotent create/rotate response.

Any `2xx` acknowledges. Network/timeouts plus `408`, `409`, `425`, `429`, and `5xx` retry with bounded
exponential backoff for at most eight attempts; `410` and unsafe endpoints disable immediately. Delivery,
attempt, failure, disablement, and replay history is retained. A replay creates a linked new delivery for the
same event and uses the active secret. Rotation stops binding new events/replays to the retired secret, while
already queued deliveries may use it only through the bounded retry horizon, so receivers keep the previous
verifier for 24 hours.

Each HTTP attempt is reserved durably before network I/O and completed exactly once afterward. Disabling an
endpoint preserves a live processing owner long enough to record the real result; an expired reservation is
reconciled as ambiguous before terminal cancellation. Replay locks and rechecks the failed delivery, endpoint,
subscription, and active secret, so concurrent disablement or rotation cannot bind stale state.

The public API event catalog, exact signature input, headers, acknowledgement rules, retry schedule, and replay
semantics are compatibility commitments and current M3 completion evidence. The
[customer-webhook examples](../examples/customer-webhook/README.md) provide TypeScript and Python raw-body
receivers sharing a golden vector generated from the production signer; `npm run examples:check` verifies
both receivers, tamper/timestamp denial, the [local provider-callback example](../examples/provider-callback/README.md),
and the public-client inventory without contacting Twilio or another external service.

## Provider callbacks

Twilio webhook foundations are implemented for inbound message and delivery-status callbacks:

- `POST /api/webhooks/twilio/inbound`
- `POST /api/webhooks/twilio/status`

Both handlers accept string-only form payloads, return `400` for malformed or unsupported form bodies before signature validation, reject non-string form parts and duplicate form field names before signature validation, and validate `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN`, the exact request URL, and all form parameters, including unknown provider fields. Invalid or unsigned requests return `403`.

Valid webhook payloads are stored in `WebhookEvent` with the full raw form payload, including unknown provider fields. Before local inbox or delivery work, each request must atomically acquire a five-minute, tenant-scoped lease identified by an owner token. A simultaneous request that loses either the create race or the lease claim returns `409` with an advisory `Retry-After` and no local mutation. Already processed duplicates return `204`. Successful work is marked processed only by the current owner and clears the lease; failed work releases that owner's lease immediately. If a process exits before cleanup, a later provider retry can recover the event after lease expiry. Downstream message and status writes remain idempotent because stale recovery may repeat work interrupted between the mutation and completion marker. Delivery-status idempotency keys normalize provider status casing and surrounding whitespace before storage so provider retries cannot create duplicate local events only by changing status formatting. Inbound webhooks reject whitespace-only bodies while preserving nonblank body text exactly for local message creation.

`Retry-After` is advisory. Twilio's default connection-override retry policy does not retry HTTP status responses, so production webhook URLs must explicitly configure the desired `4xx`/`5xx` retry policy and retry count. URL fragments used for Twilio connection overrides are excluded from signature computation. Production routing and retry configuration remain human-gated in `tickets/TICKET023.md`; the local handler must not claim that a `409` alone guarantees redelivery. See [Twilio webhook connection overrides](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides).

Inbound webhooks create local inbox messages through the existing demo-safe inbound path, so STOP updates local consent and HELP is recorded. The webhook path explicitly disables sentiment analysis and keyword auto-replies, preventing AI or outbound provider behavior. Message ID and status normalization falls back from blank modern Twilio fields to nonblank legacy aliases before idempotency keys are derived. Status webhooks update matching local messages by provider message ID with provider status, optional error code, and delivered/failed timestamps. The update predicate is atomic and monotonic: stale earlier callbacks cannot overwrite later or terminal evidence, terminal success and failure cannot replace one another, and unknown provider statuses are retained only while the message remains non-terminal. Terminal delivered versus failed/undelivered transitions clear the opposite terminal timestamp to avoid stale delivery metadata.

If a status callback arrives before the matching tenant message is persisted, the event remains unprocessed: its lease is released and the handler returns `409` with advisory `Retry-After`. This preserves the raw event for a configured provider retry or later reconciliation instead of marking unapplied delivery evidence complete.

Webhook handlers must never send SMS replies, email, notifications, billing events, live AI calls, or provider mutations.
