# Webhooks Contract

Owner: integrations-ai.

## Outbound customer event webhooks (M3 complete)

Customer webhooks notify company software after tenant domain changes. They are not provider callbacks and
never authenticate an inbound SignalStack mutation. This is the implemented frozen M3 protocol: endpoint
administration, durable worker recovery, replay, cross-runtime examples, and the non-owner external-network
receiver proof are complete. Detailed acceptance is in `plan/specs/SPEC-031-public-integrations.md`.

### Subscription and event catalog

Subscriptions select only exact values from this additive allowlist:

- `contact.created`, `contact.updated`, `contact.archived`
- `message.accepted`, `message.sent`, `message.delivered`, `message.failed`, `message.received`,
  `message.status.updated`
- `campaign.scheduled`, `campaign.started`, `campaign.completed`, `campaign.failed`, `campaign.canceled`
- `conversation.created`, `conversation.updated`
- `webhook.endpoint.disabled`

`message.status.updated` covers every durable normalized status transition; a specific lifecycle event may be
created for the same transition. Receivers deduplicate by event ID, not aggregate ID.

An immutable event and one delivery for each matching active subscription are inserted in the same tenant
transaction as the domain mutation. A rollback leaves neither. The canonical JSON body is bounded and has
exactly the public event ID, allowlisted `type`, `apiVersion`, UTC `occurredAt`, and minimized `data` snapshot.
It excludes raw provider payloads, secrets, hashes, and unrelated tenant data. Delivery is at least once;
receivers persist the event ID before applying effects.

### Endpoint and secret boundary

Production endpoints are canonical public `https://` URLs without userinfo, query strings, or fragments. Every attempt
resolves DNS again, rejects the entire answer set if any address is private/local/reserved, pins one vetted
public address while retaining hostname SNI/certificate validation, requires TLS 1.2+, and follows no
redirect. DNS, request, response, request-body, response-body, and header sizes are bounded. Unsafe DNS or
URL state disables the endpoint rather than making a request. Endpoint URLs are immutable; replacing a
destination requires creating a new endpoint so queued deliveries cannot be silently rerouted.

Creation and rotation return one `whsec_` plus the 43-character base64url encoding of 32 random bytes only
in that logical idempotent operation; an exact retry within the 24-hour idempotency window reproduces the
same encrypted response snapshot, while every later GET/list response exposes only its fingerprint. The secret is
authenticated-encrypted under the separately supplied `SECRETS_MASTER_KEY`, bound to its tenant,
subscription, secret ID, and version; only a safe fingerprint is listable. Raw signing secrets never enter
logs, audit metadata, event/delivery rows, URLs, list responses, or browser state.

### Signed delivery protocol

Each request is an HTTPS JSON `POST` with `User-Agent: SignalStack-Customer-Webhooks/1` and these headers:

- `X-SignalStack-Event-Id`
- `X-SignalStack-Event-Type`
- `X-SignalStack-Delivery-Id`
- `X-SignalStack-Timestamp` containing Unix seconds
- `X-SignalStack-Secret-Version` containing the pinned positive integer signing-secret version
- `X-SignalStack-Signature` containing exactly `v1=<64 lowercase hex characters>`

The signature is HMAC-SHA-256 with the 32 decoded `whsec_` bytes over the exact bytes
`"signalstack/customer-webhook-signature/v1\0" + timestamp + "." + raw_body`. Receivers verify the raw
body before parsing, use constant-time digest comparison, reject ambiguous/duplicate headers, enforce an
approximately five-minute timestamp window, and then deduplicate the event. Re-serialized JSON does not
verify.

### Acknowledgement, retry, disablement, replay, and rotation

- Any `2xx` acknowledges delivery; the response body is ignored and drained only to a bounded size.
- Network/timeouts and HTTP `408`, `409`, `425`, `429`, and `5xx` retry. A valid `Retry-After` is honored only
  up to the six-hour ceiling. Redirects are never followed; other `3xx`/`4xx` are permanent failures.
- `410 Gone` and newly unsafe endpoint resolution disable immediately. Ten consecutive terminal delivery
  failures also disable; a successful delivery resets the count. Disabled endpoints receive no new fanout,
  and the retained state may produce `webhook.endpoint.disabled` for other active subscriptions.
- Default delivery permits at most eight attempts with exponential delays after failed attempts of 30
  seconds, 2 minutes, 8 minutes, 32 minutes, 2 hours 8 minutes, and then at most 6 hours per remaining retry.
- Each attempt is append-only and includes generation/attempt number, request timestamp, outcome, status or
  safe error class, and bounded start/finish evidence. Expired worker leases make work claimable without
  erasing or duplicating the event.
- Replay is allowed only for terminal failed delivery. It creates a linked new delivery/generation for the
  same immutable event, retains every prior attempt, uses the active secret, and follows the normal retry
  policy. The public replay request itself is scoped and idempotent.
- Rotation retires the previous secret for new events/replays. Already-created deliveries remain bound to
  their original secret for deterministic retries, so receivers retain the prior verifier for 24 hours (more
  than the default retry horizon). Disabling the endpoint stops those attempts immediately.

Receiver verification examples for TypeScript and Python, the curl/TypeScript/Python public clients, and
delivery/replay/rotation/concurrency tests are current M3 implementation evidence. They remain dummy/local
and do not prove live provider transport.

Twilio inbound and status webhooks validate `X-Twilio-Signature`, preserve raw provider payloads, and are idempotent before any mutation.

## M4 trusted provider callback routing

Provider callbacks never use a browser session, API key, deterministic demo organization, or the
installation-global `TWILIO_AUTH_TOKEN` as tenant authority. Routing order is fixed:

1. Parse one bounded URL-encoded string-only form and reject duplicate/file fields.
2. Normalize exact Twilio `AccountSid` plus the event-specific owned destination (`To` for inbound, `From`
   for outbound status, with optional same-account `MessagingServiceSid`).
3. Use domain-separated keyed hashes for one bounded SELECT-only pre-tenant candidate lookup.
4. Require exactly one ACTIVE/VERIFIED account, imported number/service, and active encrypted credential
   version; decrypt only that credential and validate the signature over the exact external URL and all form
   parameters.
5. Enter the resolved tenant transaction, lock and recheck account/ownership/credential generation, then
   record the raw event and acquire the existing processing lease.

Wrong signature/credential/destination, crossed or unknown account/resource, detected ambiguity,
disabled/revoked state, and a rotate/revoke race all return the same no-store `403` body
`{ "error": "Provider callback rejected.", "code": "INVALID_PROVIDER_CALLBACK" }`. Routing/crypto storage
unavailability returns secret-free `503 WEBHOOK_ROUTING_UNAVAILABLE`. Every denial occurs before
`WebhookEvent`, contact, conversation, message, tenant-attributed metric, or audit insertion and reveals no
account/tenant/resource existence.

Implemented foundations:

- `POST /api/webhooks/twilio/inbound`
- `POST /api/webhooks/twilio/status`

Rules:

- Webhook requests are `application/x-www-form-urlencoded`.
- Malformed or unsupported form bodies return `400` before signature validation, current-org lookup, webhook-event storage, or local message/delivery mutation.
- Non-string form parts are rejected before signature validation; Twilio webhook helpers must not coerce file/blob parts into filenames or trusted payload fields.
- Duplicate form field names are rejected before signature validation; Twilio webhook helpers must not collapse repeated fields into an ambiguous last-value payload.
- Signature validation uses the exact request URL, all received parameters including unknown provider
  fields, and only the resolved account credential version. The environment token is not routing authority.
- Missing or invalid signatures and every unusable routing candidate share the generic M4 `403`.
- Missing required normalized fields return `400`.
- A valid event whose request acquires the processing lease returns `204` after local completion. An already processed duplicate also returns `204`. An unprocessed duplicate with a live lease returns `409` with an advisory `Retry-After` and performs no downstream mutation. Automatic retry is an upstream webhook-configuration concern and must not be assumed from the response header alone.
- Raw payloads are stored in `WebhookEvent.rawPayload` without dropping unknown provider fields.
- Every unprocessed webhook must atomically acquire a tenant-scoped, expiring processing lease with a unique owner token before it may run local message/contact/delivery mutations. A request that loses the create or claim race returns the in-progress `409` path without downstream mutation so a later provider retry is not suppressed if the owner fails.
- Claim owner tokens are generated internally; webhook payloads cannot supply them and responses do not expose them.
- `processedAt` may be set only by the lease owner after downstream work completes, and completion clears the lease. Downstream failure releases that owner's claim for immediate retry. If a process exits without releasing, a provider retry may recover the event only after the lease expires.
- Lease ownership narrows concurrent processing to one active request; downstream writes remain independently idempotent because stale-lease recovery can retry work after an interrupted process.
- Delivery-status idempotency keys normalize provider message ID whitespace, provider status casing/whitespace, provider error-code whitespace, and blank modern/legacy field alias fallback before local storage.
- Inbound webhook idempotency keys normalize provider message ID whitespace and blank modern/legacy message ID alias fallback before local storage, inbound `From`/`To` addresses are trimmed before local contact/message creation, and whitespace-only inbound bodies are rejected without trimming stored nonblank body text.
- Inbound webhooks may create local inbox messages and local STOP/HELP consent effects through the same demo-safe inbound path.
- Status webhooks may update matching local `Message` rows within the current tenant by `providerMessageId` with provider status, provider error code, and delivered/failed timestamps. Updates use an atomic current-status and terminal-timestamp guard: known statuses advance monotonically, terminal success and failure states cannot overwrite each other, stale earlier callbacks are ignored, and previously unknown provider statuses may be retained only before terminal delivery evidence exists. Delivered transitions clear stale failed timestamps; the shared terminal-failure vocabulary (`failed`, `undelivered`, and `canceled`) clears stale delivered timestamps, sets `failedAt`, and drives failure metrics and local delivery reporting consistently.
- A status callback that arrives before its tenant-scoped `Message` exists remains unprocessed: the handler releases its claim and returns `409` with advisory `Retry-After` instead of permanently acknowledging delivery evidence it could not apply.

## Post-MVP Local Webhook Operations

The consolidated `/settings` readiness view renders the local webhook safety boundary. It may display Twilio route coverage, stored local webhook event counts, provider/event-type summaries, recent idempotency keys, and received timestamps; there is no dedicated webhook settings page.

This view is read-only. It must not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, expose secrets, send notifications, create billing records, send SMS, or enable live messaging.
- Webhook handlers must not send SMS replies, email, notifications, billing events, or provider mutations.
