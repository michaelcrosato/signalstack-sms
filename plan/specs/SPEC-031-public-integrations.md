# SPEC-031 — Public API Identity and Customer Webhooks

- **Status:** Complete
- **Priority:** P0
- **Roadmap:** M3 in `docs/STANDALONE_ROADMAP.md`
- **External services:** none; customer HTTPS receivers are optional integration targets

## Goal

Give company software a stable, tenant-scoped `/api/v1` boundary without reusing browser sessions, and
give each organization a durable, signed event-delivery channel. PostgreSQL is authoritative for API-key
rate windows, idempotency, event fanout, delivery attempts, retry state, replay, and audit evidence.

This specification freezes the implemented M3 protocol. The evidence below completes the public API and
customer-webhook milestone; it is not evidence that any live provider path is complete.

## Non-goals and safety boundary

- M3 does not enable live SMS/MMS. `POST /api/v1/messages` uses the dummy provider until M5's durable
  transport boundary is complete and explicitly activated.
- A browser cookie, demo principal, Clerk/OIDC token, webhook signature, or provider credential is never
  accepted as a public API credential.
- Customer event webhooks are outbound notifications. They are separate from signed inbound carrier
  callbacks under `/api/webhooks/**` and never authorize a SignalStack mutation.
- API and customer-webhook secrets never enter source control, logs, URLs, audit metadata, browser state,
  or list/read responses. Creation/rotation is one logical idempotent operation: an exact retry may reproduce
  its authenticated-encrypted response snapshot, but no later unrelated request can read the raw secret.

## Public API authentication

Every `/api/v1` resource or mutation route requires exactly one
`Authorization: Bearer ss_api_<12-base64url-prefix>_<43-base64url-secret>` header. Multiple credentials,
query-string keys, cookies, and alternate schemes are rejected. `GET /api/v1/openapi.json` is the single
unauthenticated metadata exception.

The raw 256-bit secret is returned once. PostgreSQL stores a domain-separated HMAC-SHA-256 digest keyed by
the server-only `API_KEY_PEPPER` plus a non-secret visible prefix. Pre-tenant lookup is allowed only through
an exact key-hash control context; every expiry, revocation, scope, rate, last-use, and domain operation then
runs inside the resolved tenant transaction. Unknown, expired, revoked, rotated-away, and otherwise unusable
keys share the public `INVALID_API_KEY` result.

Credential creation accepts a name, at least one catalog scope, an optional future expiry, and a one-minute
rate limit from 1 through 10,000. Rotation changes the raw token, prefix, and stored hash in place, clears
last-use/rate-window evidence, and invalidates the prior token. Revocation is idempotent and terminal. Create,
rotate, revoke, expiry, and use metadata are tenant-scoped and audited without raw keys or hashes.

## Scope catalog

There are no wildcard or implied scopes. A route may require more than one exact scope.

| Scope | Authority |
| --- | --- |
| `organization:read` | Read the current organization summary. |
| `contacts:read`, `contacts:write` | Read or mutate contacts. |
| `tags:read`, `tags:write` | Read or mutate contact tags. |
| `lists:read`, `lists:write` | Read or mutate contact lists and membership. |
| `segments:read`, `segments:write` | Read/evaluate or mutate saved segments. |
| `templates:read`, `templates:write` | Read or mutate message templates. |
| `messages:read`, `messages:write` | Read message records or mutate non-send message metadata. |
| `messages:send` | Submit an external-impact message action; M3 remains dummy-only. |
| `campaigns:read`, `campaigns:write` | Read campaigns or mutate non-send campaign state. |
| `campaigns:send` | Schedule or cancel provider-impact campaign work. |
| `conversations:read`, `conversations:write` | Read or mutate shared-inbox conversations. |
| `deliveries:read` | Read message delivery status. |
| `credentials:read`, `credentials:write` | Read or rotate/revoke the calling API credential. |
| `webhooks:read`, `webhooks:write`, `webhooks:replay` | Read/administer customer hooks or replay a failed delivery. |

Public credentials can read, rotate, or revoke only themselves; tenant-wide key creation/administration stays
behind the cookie-authenticated ADMIN boundary. The explicit `messages:send` and `campaigns:send` scopes
prevent an ordinary write grant from gaining live-impact authority when later milestones add provider
transport.

## Response and request contract

All `/api/v1` JSON responses, including errors and deletes, are non-cacheable and use one of these shapes:

```json
{
  "ok": true,
  "data": {},
  "meta": { "requestId": "550e8400-e29b-41d4-a716-446655440000" }
}
```

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request failed validation.",
    "details": []
  },
  "meta": { "requestId": "550e8400-e29b-41d4-a716-446655440000" }
}
```

`details` is optional, bounded, machine-readable, and never contains internal exception text, SQL, secrets,
hashes, or foreign-tenant evidence. Human messages may be clarified compatibly; clients branch on codes.
Every response sets `X-Request-Id` to the same UUID in `meta.requestId`. One valid client-supplied UUID may
be reused for correlation; missing, duplicated, malformed, or control-bearing values are replaced by a
server-generated UUID.

Stable M3 error codes and statuses are:

| Status | Codes |
| --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_JSON`, `INVALID_CURSOR`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID` |
| 401 | `AUTHENTICATION_REQUIRED`, `INVALID_API_KEY` |
| 403 | `INSUFFICIENT_SCOPE` |
| 404 | `NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED` |
| 409 | `CONFLICT`, `IDEMPOTENCY_CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR`, `OPERATION_NOT_ALLOWED` |
| 429 | `RATE_LIMIT_EXCEEDED` |
| 500 | `INTERNAL_ERROR` |
| 502 | `UPSTREAM_ERROR` |
| 503 | `SERVICE_UNAVAILABLE` |

Malformed/missing bearer evidence uses `AUTHENTICATION_REQUIRED`; a well-formed but unusable key uses the
single `INVALID_API_KEY` lifecycle result. Authentication, tenant-context, or PostgreSQL rate-limit failure
returns `SERVICE_UNAVAILABLE`, never an in-memory fallback or an unmetered request.

## Pagination

Paginated collections use `limit` plus `cursor`, never offset/page numbers. The default limit is 50 and the
maximum is 100. Rows have a deterministic newest-first `(createdAt DESC, id DESC)` order. Successful list
metadata contains `nextCursor: string | null` and `hasMore: boolean`.

The cursor is a maximum-1,024-character base64url payload plus HMAC-SHA-256 signature. Version 1 binds the
tenant, canonical resource name, canonical UTC `createdAt`, and row ID. Callers must treat it as opaque. A
changed byte, unsupported version, malformed field, foreign tenant, foreign resource, or wrong signing key
returns only `INVALID_CURSOR`; it never falls back to an unbounded or first-page query.

## Idempotent writes

Every public `POST`, `PUT`, `PATCH`, and `DELETE` requires one `Idempotency-Key` matching
`[A-Za-z0-9._:-]{8,128}`. The key is HMAC-hashed before storage and scoped to the exact organization and API
credential. The request binding includes the uppercase method, canonical route template, and canonical JSON
body. Query parameters that affect the mutation must be normalized into that canonical binding.

PostgreSQL acquires a transaction advisory lock for the credential/key, then performs the domain mutation
and writes the completed response envelope in the same tenant transaction. An exact retry within 24 hours
returns the original status, body, and request ID with `Idempotency-Replayed: true`. Reusing the
key for another method, route, or body returns `409 IDEMPOTENCY_CONFLICT` without mutation. There is no
durable in-progress record: a rollback leaves neither a committed resource nor a replay result.

Canonical request JSON is bounded to 1 MiB and replay responses are bounded to 128 KiB and encrypted at
rest with a domain-separated AES-256-GCM key derived from `SECRETS_MASTER_KEY`. Expired records may be
replaced only under the same lock. Credential rotation preserves the credential ID and its idempotency
namespace; revocation prevents authentication and therefore replay.

## Per-key rate limits

Each authenticated request consumes its credential's PostgreSQL-authoritative fixed one-minute window
before scope evaluation or route body parsing. Redis and process memory may optimize but never replace that
counter. Authenticated responses carry:

- `RateLimit-Limit`: configured requests per minute.
- `RateLimit-Remaining`: non-negative remaining requests in this window.
- `RateLimit-Reset`: window reset time as Unix seconds.
- `Retry-After`: positive seconds on `429 RATE_LIMIT_EXCEEDED`.

Concurrent requests serialize on the credential row. Exhausted requests do not run route mutations.

## Frozen `/api/v1` route table

`GET /api/v1/openapi.json` is public metadata and declares every route, scope, envelope, schema, error,
idempotency header, cursor, rate header, and webhook payload defined here. Every other row is bearer-only.

| Method and path | Required scope(s) | Contract |
| --- | --- | --- |
| `GET /api/v1/organization` | `organization:read` | Current tenant summary only. |
| `GET /api/v1/contacts` | `contacts:read` | Cursor-paginated contacts. |
| `POST /api/v1/contacts` | `contacts:write` | Create a contact; idempotent. |
| `GET /api/v1/contacts/:contactId` | `contacts:read` | Read one tenant contact. |
| `PATCH /api/v1/contacts/:contactId` | `contacts:write` | Update/restore one contact; idempotent. |
| `DELETE /api/v1/contacts/:contactId` | `contacts:write` | Soft-archive; idempotent. |
| `GET /api/v1/tags` | `tags:read` | Cursor-paginated tags. |
| `POST /api/v1/tags` | `tags:write` | Create a tag; idempotent. |
| `GET /api/v1/tags/:tagId` | `tags:read` | Read one tag. |
| `PATCH /api/v1/tags/:tagId` | `tags:write` | Rename one tag; idempotent. |
| `DELETE /api/v1/tags/:tagId` | `tags:write` | Delete one unreferenced tag; idempotent. |
| `GET /api/v1/lists` | `lists:read` | Cursor-paginated lists. |
| `POST /api/v1/lists` | `lists:write` | Create a list; idempotent. |
| `GET /api/v1/lists/:listId` | `lists:read` | Read one list. |
| `PATCH /api/v1/lists/:listId` | `lists:write` | Update one list; idempotent. |
| `DELETE /api/v1/lists/:listId` | `lists:write` | Delete one list and its memberships; idempotent. |
| `GET /api/v1/lists/:listId/contacts` | `lists:read`, `contacts:read` | Cursor-paginated membership. |
| `POST /api/v1/lists/:listId/contacts` | `lists:write` | Add tenant contacts; idempotent. |
| `DELETE /api/v1/lists/:listId/contacts/:contactId` | `lists:write` | Remove membership; idempotent. |
| `GET /api/v1/segments` | `segments:read` | Cursor-paginated saved segments. |
| `POST /api/v1/segments` | `segments:write` | Create a saved segment; idempotent. |
| `GET /api/v1/segments/:segmentId` | `segments:read` | Read one segment. |
| `PATCH /api/v1/segments/:segmentId` | `segments:write` | Update one segment; idempotent. |
| `DELETE /api/v1/segments/:segmentId` | `segments:write` | Delete one saved segment; idempotent. |
| `GET /api/v1/segments/:segmentId/contacts` | `segments:read`, `contacts:read` | Evaluate with a bounded cursor. |
| `GET /api/v1/templates` | `templates:read` | Cursor-paginated templates. |
| `POST /api/v1/templates` | `templates:write` | Create a template; idempotent. |
| `GET /api/v1/templates/:templateId` | `templates:read` | Read one template. |
| `PATCH /api/v1/templates/:templateId` | `templates:write` | Update one template; idempotent. |
| `DELETE /api/v1/templates/:templateId` | `templates:write` | Delete one unreferenced template; idempotent. |
| `GET /api/v1/messages` | `messages:read` | Cursor-paginated messages. |
| `POST /api/v1/messages` | `messages:send` | Submit one idempotent dummy message in M3. |
| `GET /api/v1/messages/:messageId` | `messages:read` | Read one message. |
| `GET /api/v1/messages/:messageId/status` | `deliveries:read` | Read normalized delivery state. |
| `GET /api/v1/campaigns` | `campaigns:read` | Cursor-paginated campaigns. |
| `POST /api/v1/campaigns` | `campaigns:write` | Create a draft; idempotent. |
| `GET /api/v1/campaigns/:campaignId` | `campaigns:read` | Read one campaign. |
| `PATCH /api/v1/campaigns/:campaignId` | `campaigns:write` | Update a draft; idempotent. |
| `POST /api/v1/campaigns/:campaignId/schedule` | `campaigns:send` | Schedule after final gates; idempotent. |
| `POST /api/v1/campaigns/:campaignId/cancel` | `campaigns:send` | Cancel/pause send work; idempotent. |
| `GET /api/v1/conversations` | `conversations:read` | Cursor-paginated conversations. |
| `GET /api/v1/conversations/:conversationId` | `conversations:read` | Read one conversation. |
| `GET /api/v1/conversations/:conversationId/messages` | `conversations:read`, `messages:read` | Cursor-paginated thread. |
| `POST /api/v1/conversations/:conversationId/messages` | `conversations:write`, `messages:send` | Submit an idempotent reply. |
| `GET /api/v1/api-keys/current` | `credentials:read` | Read the caller's safe key metadata only. |
| `POST /api/v1/api-keys/current/rotate` | `credentials:write` | Rotate the calling key and reveal once. |
| `DELETE /api/v1/api-keys/current` | `credentials:write` | Revoke the calling key idempotently. |
| `GET /api/v1/webhook-event-types` | `webhooks:read` | Read the exact subscription allowlist. |
| `GET /api/v1/webhook-endpoints` | `webhooks:read` | List endpoints without secrets. |
| `POST /api/v1/webhook-endpoints` | `webhooks:write` | Create endpoint/subscription and reveal its secret once. |
| `GET /api/v1/webhook-endpoints/:endpointId` | `webhooks:read` | Read endpoint status. |
| `PATCH /api/v1/webhook-endpoints/:endpointId` | `webhooks:write` | Update/enable/disable; idempotent. |
| `DELETE /api/v1/webhook-endpoints/:endpointId` | `webhooks:write` | Disable without erasing history. |
| `POST /api/v1/webhook-endpoints/:endpointId/rotate-secret` | `webhooks:write` | Rotate and reveal once. |
| `GET /api/v1/webhook-endpoints/:endpointId/deliveries` | `deliveries:read` | Read bounded delivery/attempt status. |
| `POST /api/v1/webhook-deliveries/:deliveryId/replay` | `webhooks:replay` | Replay one failed delivery; idempotent. |

Adding fields, error detail members, event types, or routes is additive within v1. Removing or changing a
field, route, event meaning, required scope, or status/code mapping requires a new API version or a published
compatibility window.

## Customer event catalog and payload

Subscriptions accept only these exact event types:

- `contact.created`, `contact.updated`, `contact.archived`
- `message.accepted`, `message.sent`, `message.delivered`, `message.failed`, `message.received`,
  `message.status.updated`
- `campaign.scheduled`, `campaign.started`, `campaign.completed`, `campaign.failed`, `campaign.canceled`
- `conversation.created`, `conversation.updated`
- `webhook.endpoint.disabled`

`message.status.updated` is emitted for every durable normalized status transition. A more specific message
event may be emitted for the same transition, so receivers deduplicate by event ID rather than aggregate ID.
The event body is canonical JSON:

```json
{
  "apiVersion": "2026-07-10",
  "id": "event_uuid",
  "type": "message.delivered",
  "occurredAt": "2026-07-11T05:30:00.000Z",
  "data": {}
}
```

Event rows and one delivery per matching active subscription are committed in the same tenant transaction as
the domain mutation. Delivery is at least once; receivers use `id` as their durable deduplication key. Payloads
contain only the minimum event snapshot and never raw credentials, hashes, unrelated tenant identifiers, or
provider payloads.

## Customer webhook signing protocol

Creation/rotation returns a 256-bit `whsec_<43-base64url-bytes>` receiver secret once. At rest it is wrapped
with AES-256-GCM under `SECRETS_MASTER_KEY`, with tenant/subscription/secret/version binding and only a safe
fingerprint exposed administratively.

Each HTTPS POST includes:

- `Content-Type: application/json`
- `User-Agent: SignalStack-Customer-Webhooks/1`
- `X-SignalStack-Event-Id: <event id>`
- `X-SignalStack-Event-Type: <catalog type>`
- `X-SignalStack-Delivery-Id: <delivery id>`
- `X-SignalStack-Timestamp: <Unix seconds>`
- `X-SignalStack-Secret-Version: <positive integer>`
- `X-SignalStack-Signature: v1=<64 lowercase hex characters>`

The signature is HMAC-SHA-256 with the 32 decoded `whsec_` bytes over the exact byte sequence:

```text
"signalstack/customer-webhook-signature/v1\0" + timestamp + "." + raw_request_body
```

Receivers must verify the exact raw bytes with constant-time comparison before JSON parsing, reject duplicate
signature/timestamp headers, enforce an approximately five-minute timestamp window, validate the event ID,
and deduplicate the event before effects. JSON reformatting before verification invalidates the signature.

## Endpoint safety, acknowledgement, and retries

- Production endpoints are canonical public `https://` URLs with no userinfo, query string, or fragment.
  Endpoint URLs are immutable; changing a destination requires a new endpoint. Every attempt
  resolves DNS again, rejects mixed public/private answer sets, pins one vetted public address while preserving
  the hostname for SNI/certificate validation, requires TLS 1.2+, and follows no redirect.
- DNS, request, and response timeouts default to five seconds or less. Request bodies are bounded to 1 MiB;
  receiver response bodies are drained only to 64 KiB. Response bodies are not interpreted as acknowledgements.
- Any `2xx` acknowledges delivery. `408`, `409`, `425`, `429`, `5xx`, network errors, and timeouts retry.
  `Retry-After` delta-seconds or HTTP-date is honored only within the six-hour ceiling.
- `410 Gone` or a newly unsafe endpoint disables the endpoint immediately. Other `3xx` and `4xx` are permanent
  failures and are never followed or retried.
- Default delivery has at most eight attempts. Delays after failed attempts are 30 seconds, 2 minutes,
  8 minutes, 32 minutes, 2 hours 8 minutes, then at most 6 hours for each remaining retry. A success resets
  consecutive endpoint failures; ten consecutive terminal delivery failures disable the endpoint and emit
  `webhook.endpoint.disabled` without recursively delivering that event to the disabled endpoint.
- Disabled endpoints receive no new fanout. Pending rows are retained with terminal/cancelled evidence; no
  delivery, event, or attempt history is hard-deleted.

Each attempt has a bounded processing lease, monotonically increasing attempt number/generation, request
timestamp, status/error classification, and start/finish evidence. Worker crash or lease expiry makes work
claimable again without losing the event.

## Replay and secret rotation

Only a terminal failed delivery may be replayed. Replay creates a new generation/delivery linked to the same
immutable event and original delivery, preserves every old attempt, uses the current active secret, and enters
the normal bounded retry policy. The replay mutation itself requires `Idempotency-Key` and `webhooks:replay`.

Secret rotation retires the prior secret for new events and reveals the replacement once. Already-created
delivery rows remain bound to the secret that signed their first attempt so a retry is deterministic; no new
event or replay may bind the retired secret. Receivers should retain the prior verification secret for 24 hours,
which exceeds the default retry horizon. Disabling an endpoint stops old-secret attempts immediately.

## Browser administration

The cookie-authenticated settings routes are a separate administrative bootstrap boundary:

- `GET|POST /api/settings/api-keys`
- `POST|DELETE /api/settings/api-keys/:credentialId`

They require the current local/demo-safe tenant and at least ADMIN, enforce same-origin checks on mutations,
return one-time raw keys only from create/rotate, and otherwise list safe prefix/scope/expiry/last-use/revocation
metadata. These routes do not use the `/api/v1` envelope or authorize company-software requests.

## Rollout slices

1. Freeze catalogs, envelopes, errors, request IDs, cursor, idempotency, and contracts.
2. Add tenant-scoped credential/idempotency/webhook models, composite relations, forced RLS, exact control
   policy, runtime posture, and two-tenant database proof.
3. Add API-key administration, bearer authentication, PostgreSQL rate consumption, and OpenAPI.
4. Add initial `/api/v1` resources and atomic domain-event fanout.
5. Add secret administration, safe delivery worker, retries, endpoint disablement, replay, and receiver
   verification examples.
6. Run the external test application exit proof without live carrier impact.

## Acceptance criteria

- [x] A key secret is returned only by its logical create/rotate operation (including an exact encrypted
  idempotent replay); only its digest/prefix persist outside that encrypted snapshot, and
  rotation/revocation immediately deny the old bearer without leaking lifecycle state.
- [x] Missing bearer, invalid bearer, missing scope, expiry, rate exhaustion, and database failure use the
  frozen envelopes, codes, request IDs, and headers before body parsing.
- [x] Every listed mutating route requires one bounded idempotency key; exact concurrent retries create one
  domain result, while changed request bindings return `IDEMPOTENCY_CONFLICT`.
- [x] A foreign-tenant/resource or tampered cursor fails generically; bounded pagination has no duplicate or
  skipped row under equal timestamps.
- [x] PostgreSQL concurrency cannot exceed a key's minute limit, and process restart cannot reset the window.
- [x] A public credential cannot enumerate or mutate another credential; browser ADMIN management never
  returns stored secrets/hashes.
- [x] Domain mutations atomically create allowlisted event/delivery rows; rollback creates neither.
- [x] Receiver tests verify exact raw-byte HMAC, timestamp tolerance, tamper denial, and event deduplication.
- [x] Delivery tests cover `2xx`, retryable/permanent statuses, `410`, timeouts, DNS rebinding, redirects,
  bounded response bodies, backoff, exhaustion, crash recovery, and endpoint auto-disablement.
- [x] Replay preserves history and uses the active secret; rotation never returns or logs a secret from a
  different/prior operation (an exact encrypted retry may reproduce its own logical rotation response).
- [x] OpenAPI plus curl, TypeScript, Python, provider-callback, and webhook-verification examples match the
  implemented protocol.
- [x] `npm run openapi:check`, `npm run examples:check`, `npm run contracts:check`, focused
  unit/PostgreSQL tests, and `npm run validate` pass.

## Exit criteria

The literal external-network test creates a fresh database and separate NOINHERIT web/worker logins, starts a
real Next HTTP server under forced RLS plus a separate receiver socket, and proves organization A/B foreign
read/write denial plus canonical unknown/method behavior. It then concurrently creates a contact,
submits/replays a dummy/local message, reads status, verifies the exact signed raw event body, records a
terminal failed delivery, rotates the webhook secret, replays with the new secret while the old verifier
fails, rotates the API key, and proves the prior and revoked keys are denied.
The 43-migration/36-protected-table substrate, generated OpenAPI drift gate, cross-runtime examples, public
protocol/auth suites, and customer-webhook transport/worker recovery suites keep that proof current. No step
calls a carrier or enables live SMS/MMS.
