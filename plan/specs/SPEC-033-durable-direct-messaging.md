# SPEC-033 — Durable Direct Messaging and Twilio Transport

- **Status:** Done
- **Priority:** P0
- **Roadmap:** M5 in `docs/STANDALONE_ROADMAP.md`
- **External services:** worker-invoked Twilio message create/fetch only after every durable and live gate;
  tests use deterministic adapters and fixtures

## Goal

Accept an individual outbound message once, commit its recipient/payload/idempotency/first-attempt evidence
before any carrier impact, execute it through a recoverable PostgreSQL outbox, and expose application,
attempt, and provider outcomes without conflating them. Public direct messages and inbox replies share this
path. An uncertain carrier create is visible and is never automatically repeated.

## Safety boundary

- PostgreSQL is authoritative for accepted work and recovery. Redis/BullMQ is not required for M5.
- `MessageAttempt` is the individual-message outbox. The existing `QueueJob` remains campaign-specific;
  production campaign execution stays blocked until M7.
- `POST /api/v1/messages`, public conversation replies, and browser inbox replies never call Twilio.
- `dummy` stays deterministic and network-free. Demo/local acceptance may finalize the dummy attempt in the
  acceptance transaction because that adapter has no external impact; it still creates the same durable
  `Message` and `MessageAttempt` evidence.
- A Twilio create requires `LIVE_MESSAGING_ENABLED=true`, `MESSAGING_PROVIDER=twilio`, `DEMO_MODE=false`,
  an explicitly authorized direct-message worker class, the complete centralized messaging hard gate, and
  a current verified M4 account/credential/owned-sender binding.
- General M5 sends use the encrypted tenant provider account store. Installation-global Twilio environment
  credentials remain limited to the isolated `/api/demo/live-test-sms` exception and do not authorize the
  general outbox.
- No test, seed, build, validation job, page render, API acceptance request, health check, or default worker
  configuration contacts Twilio.

## Frozen application and attempt states

`Message.applicationStatus` is the customer/application lifecycle:

- `ACCEPTED`: committed and eligible for immediate claim;
- `SCHEDULED`: a future or policy-bounded definitive retry attempt exists;
- `PROCESSING`: one worker owns the current attempt;
- `SENT`: provider creation returned or a correlated callback/fetch proved the provider message;
- `DELIVERED`: monotonic provider evidence proved delivery;
- `FAILED`: a definitive terminal failure or exhausted definitive retry policy occurred;
- `CANCELLED`: dispatch was conditionally cancelled before the provider-call frontier;
- `AMBIGUOUS`: provider impact may have occurred and human/provider evidence is required.

`MessageAttempt.status` is the outbox/provider-call lifecycle:

- `QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `AMBIGUOUS`, or
  `RESOLVED_NOT_SENT`.

Raw normalized `providerStatus` and `providerErrorCode` remain separate evidence. They never determine
claimability by themselves. Existing aggregate provider fields on `Message` remain compatibility
projections of the latest authoritative attempt/provider evidence.

## Canonical records

`Message` remains the stable API resource and gains:

- explicit application status and transport (`dummy` or `twilio`);
- immutable accepted destination E.164, body, bounded HTTPS media URL snapshot, and request fingerprint;
- accepted/scheduled/sent/cancelled/ambiguous/update timestamps and attempt count;
- the existing contact/conversation/campaign relations and provider/delivery projection fields.

`MessageAttempt` is tenant scoped and contains:

- message relation, monotonic attempt number, optional retry parent, due time, owner token/lease, claim time;
- durable `providerCallStartedAt` and completion time;
- provider/account/owned-number/credential-generation binding for the actual call;
- immutable recipient/body/media request fingerprint plus callback correlation identifier;
- provider message/status/error result, safe internal error/disposition, completion and reconciliation
  evidence.

Database invariants:

- `(orgId, messageId, attemptNumber)` and callback correlation identifiers are unique.
- Provider message identity is unique within the provider account/tenant when present.
- Every message, retry-parent, provider-account, credential, and sender relation includes `orgId`.
- A Twilio attempt has exactly one verified owned sender number in M5. Messaging-service create/fetch types
  remain supported by the adapter; dynamic service sender-pool execution is deferred until its callback
  routing/throughput controls are completed with M7.
- Attempt identity, payload binding, sender binding, correlation, and lineage are immutable after insert.
  State/result/lease/reconciliation columns change only through guarded transitions. Attempts are never
  hard-deleted.
- `MessageAttempt` joins the protected-table manifest, forced RLS, runtime fingerprints, least-privilege
  grants, static Prisma inventory, relation preflight, and mandatory two-tenant PostgreSQL matrix.

## Acceptance and permanent idempotency

The centralized reservation service runs inside its caller's tenant transaction and:

1. validates the contact and optional conversation relation and normalizes the accepted payload;
2. resolves the explicit transport and, for Twilio, the current default verified account and owned sender;
3. checks the route-specific acceptance policy without replacing the worker's final recheck;
4. obtains an advisory lock for the domain idempotency identity;
5. returns the existing message only when its immutable request fingerprint is identical;
6. returns a stable conflict when the same identity is bound to any different route, direction, contact,
   conversation, destination, body, media, or transport;
7. creates the `Message`, attempt 1, conversation projection, and `message.accepted` customer-event outbox
   evidence atomically.

Public API idempotency retains the M3 compatibility scope `(orgId, apiCredentialId, Idempotency-Key)`.
The domain `Message.idempotencyKey` is an opaque credential-bound derivation and stays tenant-unique after
the 24-hour encrypted response snapshot expires. The request fingerprint is keyed and canonical; plaintext
API keys are never persisted. Identical replays return the original message and changed input returns `409`.

Browser inbox reply idempotency is `(orgId, conversationId, client request UUID)` with the same permanent
payload binding. The client creates one UUID before submission, retains it across network retries, and
clears it only after a conclusive response. Reusing a key for another message, conversation, direction, or
payload returns `409`; it never returns an unrelated inbound row.

`POST /api/v1/messages` and public conversation reply acceptance return `202` with the reserved resource
and `Location`. Missing/cross-tenant resources remain `404`; recipient policy blocks remain `422`.

## Direct payload and sender selection

- The public direct-message shape is `contactId`, optional same-contact `conversationId`, required trimmed
  body of 1–1,600 characters, and optional zero-to-ten unique HTTPS media URLs.
- SMS is body-only. A media-bearing message requires the selected owned number to advertise MMS capability.
- Destination and content are snapshotted at acceptance. A later contact phone edit does not silently
  retarget accepted work.
- M5 selects the organization's current default verified Twilio account and default verified owned number
  at acceptance. A retry retains the same destination and sender identity unless a future explicit operator
  migration contract says otherwise.
- The worker still rechecks that the account, active credential generation, owned number, capability, and
  organization binding are current immediately before provider mutation. Disable/revoke wins before call
  authorization; once call authorization commits, the attempt owns the single possible mutation.

## Worker, claim, and at-most-once frontier

A fixed-search-path, database-clocked `SECURITY DEFINER` capability claims only due attempt identities. It
is executable by the worker role and inaccessible to `PUBLIC`, runtime, web, or control roles. Ordinary
tenant rows remain inaccessible until the worker enters the returned tenant transaction.

- `QUEUED` attempts and expired `PROCESSING` attempts with no `providerCallStartedAt` are reclaimable.
- The worker validates exact ownership, reloads contact/profile/provider/sender/credential state, and calls
  `evaluateMessagingHardGate` immediately before external mutation.
- Immediately before the HTTP create, it commits `providerCallStartedAt`, the exact credential generation,
  callback correlation, and current owner evidence. This commit is the at-most-once frontier.
- An attempt at or beyond that frontier is never automatically claimed for another create. An expired
  frontier lease becomes `AMBIGUOUS`; its message becomes `AMBIGUOUS`.
- A crash before the frontier is safely reclaimable. A crash after the frontier but before the HTTP call is
  conservatively ambiguous. A crash after provider impact but before local result commit is also ambiguous.
  These false-positive ambiguities are the cost of preventing duplicate carrier sends without distributed
  transactions or a provider idempotency primitive.
- Cancellation conditionally wins only before the frontier. Once provider-call authorization exists,
  cancellation conflicts rather than pretending the message was not sent.

The direct worker is separate from M7 campaign execution. Production direct execution requires
`WORKER_ENABLED=true` and `WORKER_DEPLOYMENT_CLASS=production-live-direct`; local demo campaign behavior
remains dummy-only. The default profile authorizes neither live direct nor live campaign sends.

## Twilio create, result, and retry policy

The M4 adapter performs the bounded create using the exact stored account credential, selected owned
number, normalized E.164 destination, body/media snapshot, and a correlated HTTPS status callback URL.
Authorization headers, token material, full provider responses, and message content never enter logs,
metrics, audit metadata, or outward errors.

The callback URL contains the immutable attempt correlation ID and a domain-separated master-key HMAC.
The HMAC is recomputable but never stored or logged. The complete URL is covered by Twilio signature
validation. After signed account/sender routing, the tenant handler validates the HMAC and exact attempt,
account, sender, destination, and provider SID binding before mutation.

Result policy:

- accepted/queued/sending/sent/unknown with a valid provider SID completes the attempt and moves the
  message to `SENT`; delivered moves it to `DELIVERED`;
- immediate failed/undelivered/canceled provider results are definitive `FAILED` and are not automatically
  resent;
- validated no-impact retryable create failures may create one successor attempt transactionally;
- automatic retries are limited to three total attempts with bounded 5-second then 30-second backoff;
- network/timeout, create-side 5xx, malformed or mismatched success, SID-bearing error, successful response
  without SID, local result-persistence uncertainty, and every other possible-impact error are
  `AMBIGUOUS` and create no automatic successor.

Each provider mutation belongs to exactly one attempt. A retry closes the old attempt and creates the next
attempt number once; it never requeues or erases the old attempt.

## Callback correlation and reconciliation

Signed status callbacks remain idempotent and monotonic. Before the provider SID projection exists, a valid
attempt correlation may atomically attach the callback SID to the attempt/message. A different existing
SID, account, sender, destination, correlation, or tenant fails without mutation. Duplicate or out-of-order
callbacks are harmless. Status processing updates the attempt/provider evidence, message application
projection, and deduplicated customer-event outbox in one tenant transaction.

Provider fetch reconciliation is allowed only for an attempt with a known provider SID and a current exact
account credential. The fetched account, SID, destination, and sender must match the durable attempt before
state changes. Fetch may converge `AMBIGUOUS` to `SENT`, `DELIVERED`, or `FAILED`; a fetch failure never
causes a create or clears ambiguity.

ADMIN operator review is cookie authenticated, same-origin, no-store, tenant scoped, and append-only
audited:

- list/get exposes safe attempt state, redacted destination/sender, provider/error codes, timestamps, and
  whether review is required; never body, raw credential/account identifiers, callback token, or envelope;
- reconcile performs provider fetch only when a SID is known;
- an ambiguous attempt with no provider proof may be attested `NOT_SENT` only with an explicit confirmation
  phrase and bounded reason. This marks the old attempt `RESOLVED_NOT_SENT`;
- a retry is a separate conditional action that creates one successor attempt only after that attestation.
  Concurrent/stale/non-ambiguous review conflicts. It cannot bypass the final worker gate.

## API, DTO, and product behavior

Public message and delivery DTOs expose:

- `applicationStatus`, compatibility `status`, explicit `transport`, `attemptCount`, latest safe attempt
  status, `requiresReview`, normalized provider status/error code, and delivery timestamps;
- `mode: dummy|provider` remains for M3 compatibility and is derived from transport, never provider text;
- ambiguous is a first-class state and is never collapsed into ordinary pending.

Inbox message cards show accepted/processing/sent/delivered/failed/cancelled/ambiguous state and preserve the
client key across uncertain network outcomes. A dedicated ADMIN delivery-attempt review surface owns
reconcile/attest/retry actions; the campaign-only `/settings/queue` remains read-only and unchanged.

`POST /api/v1/messages/:messageId/cancel` is an additive idempotent public route requiring `messages:send`.
It returns the original cancelled resource on an exact replay, `404` cross-tenant, and `409` after the call
frontier or any incompatible terminal state.

## Central gate scope

M5's final direct-send gate uses the currently implemented central checks: global live flag, non-demo
runtime, Twilio selection, complete compliance profile, approved A2P state, fresh contact archive/consent/
opt-out/consent-evidence state, authoritative quiet-hours evaluation, and exact active M4 account,
credential, sender, capability, and organization ownership. M7/M9 may add throughput and entitlement/quota
inputs to the same gate; M5 does not claim those later controls early and does not weaken existing checks.

## Rollout slices

1. Freeze this spec and M5 DB/API/provider/queue/compliance/webhook/testing contracts.
2. Add message application state, `MessageAttempt` outbox, immutable relations, RLS/grants/fingerprints,
   dispatch capability, and two-tenant/race proof.
3. Add the centralized reservation service and migrate public direct/public conversation/inbox reply paths.
4. Add the direct worker, stored-credential resolver, final gate, provider create, bounded retry, and crash
   recovery.
5. Add correlated callback binding, monotonic attempt updates, provider-fetch reconciliation, and customer
   events.
6. Add ADMIN ambiguity review/retry plus public/inbox state visibility.
7. Regenerate OpenAPI/examples, run the mandatory PostgreSQL/crash/callback proof, and close M5 only after
   the protected local gate passes without a live provider call.

## Acceptance criteria

- [x] Public and inbox acceptance atomically create one message, first attempt, permanent payload binding,
  conversation projection, and accepted event before returning; routes never call Twilio.
- [x] Exact replays return the original resource after API replay expiry; changed bindings conflict, and
  concurrent acceptance creates one resource/attempt.
- [x] Application, attempt, and provider state remain distinct and every required M5 state is outwardly
  representable, including first-class ambiguity.
- [x] The worker role claims only due identities through the bounded database capability; two workers cannot
  own one attempt, pre-frontier expiry is recoverable, and post-frontier expiry is never resent.
- [x] The centralized live gate and current M4 credential/sender generation are rechecked immediately before
  the provider call. Opt-out/archive/quiet-hours/provider disable/revoke/rotation races have a single winner.
- [x] Twilio SMS/MMS fixtures prove exact request fields, HTTPS correlation, bounded timeout, redacted errors,
  result normalization, definitive retry backoff, and no automatic ambiguous resend.
- [x] Correlated callbacks can attach a SID after lost create-result persistence; duplicates/out-of-order
  callbacks and callback/create/fetch races converge without cross-tenant mutation.
- [x] Provider fetch and explicit ADMIN attestation/retry are conditional, safe, audited, and create at most
  one successor attempt. Non-ambiguous and stale reviews conflict.
- [x] Dummy demo behavior remains deterministic and network-free; campaigns and auto-responder production
  sending remain blocked for M7/M6.
- [x] Public DTO/OpenAPI/examples, inbox state, and ADMIN review make ambiguity visible without leaking body,
  credentials, exact account identifiers, callback HMACs, or other-tenant evidence.
- [x] Fresh least-privilege install/no-diff, protected-table posture, two-tenant worker/callback matrix,
  crash injection, secret scan, focused suites, and `npm run validate` pass without a carrier call.

## Exit proof

On a fresh least-privilege PostgreSQL database, two organizations accept colliding-looking direct requests
without crossing tenant state. Concurrent workers make at most one adapter create eligible per attempt.
Injected crashes after acceptance, before the call frontier, after the frontier, and after fixture provider
impact demonstrate safe reclaim or durable ambiguity as specified. Definitive fixture throttling obeys the
bounded successor policy; every possible-impact failure has no successor. Signed callback fixtures bind a
lost SID through attempt correlation and remain monotonic under replay/out-of-order delivery. ADMIN fixture
reconciliation and attested retry create at most one new attempt. Public API, inbox, OpenAPI/examples, RLS,
and the full protected gate remain green with all real live flags and carrier credentials absent.
