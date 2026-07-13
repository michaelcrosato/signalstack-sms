# Queue Contract

Owner: backend-data.

Jobs must use validated payloads and idempotency keys.

## Milestone 4 Foundation

Queue job records are persisted in `QueueJob` before any worker/provider behavior:

- `type`: `SCHEDULED_CAMPAIGN`
- `status`: `QUEUED`, `PROCESSING`, `CANCELLED`, `COMPLETED`, `FAILED`
- `idempotencyKey`: stable retry key unique with `orgId`
- `payload`: validated JSON payload
- `runAt`: scheduled execution time
- `processingToken` / `processingExpiresAt`: nullable owner lease evidence while `PROCESSING`
- `generation`: durable monotonic enqueue generation, incremented whenever a terminal/queued row is reopened

`POST /api/campaigns/:campaignId/schedule` creates or safely reopens a queued job only after campaign preflight passes and cancels any other queued local jobs for the same tenant campaign before returning the active schedule. It must not reset a `PROCESSING` or `COMPLETED` same-key row to `QUEUED`, and it rejects while any job for that campaign is processing. `POST /api/campaigns/:campaignId/cancel` first conditionally cancels tenant/type-scoped queued rows, then checks for a processing owner and guardedly pauses the still-scheduled campaign in one transaction. This ordering is the serialization boundary with a concurrent claim: cancellation wins and the claim updates zero rows, or the claim wins and cancellation rejects and rolls back.

Milestone 4 does not call live providers.

## M5 Durable Direct-Message Outbox

`MessageAttempt`, not `QueueJob`, is the authoritative PostgreSQL outbox for individual public and inbox
messages. `QueueJob` and every existing local/BullMQ worker rule below remain campaign-specific; M5 neither
routes direct sends through `SCHEDULED_CAMPAIGN` nor authorizes the reserved `production-live-campaign`
class.

Direct acceptance commits a stable `Message`, attempt one, permanent payload/idempotency binding,
conversation projection, and `message.accepted` customer-event evidence before any worker or carrier
behavior. HTTP routes never call Twilio. Dummy/local acceptance may deterministically complete its attempt
inside that transaction because it has no external impact, but it still records the same message/attempt
state and never contacts a network.

Direct attempts use these independent states: `QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`,
`AMBIGUOUS`, and `RESOLVED_NOT_SENT`. The parent `Message.applicationStatus` is a separate customer lifecycle;
raw provider status is evidence only and cannot make work claimable. A fixed-search-path, database-clocked,
worker-only dispatch capability claims bounded due attempt identities. The worker then enters the returned
tenant, conditionally owns the exact attempt, and validates its immutable payload and relations.

Claim/recovery rules are:

- due `QUEUED` attempts and expired `PROCESSING` attempts with no `providerCallStartedAt` are reclaimable;
- the owner reloads contact, compliance, provider account, active credential generation, verified owned
  sender, and capability state, then runs the centralized live gate immediately before provider mutation;
- immediately before Twilio create, the owner commits `providerCallStartedAt`, exact credential generation,
  callback correlation, and owner evidence; this is the at-most-once frontier;
- a crash before the frontier is reclaimable; a crash or lease expiry at/after the frontier conditionally
  becomes attempt/message `AMBIGUOUS` and is never automatically claimed for another create;
- cancellation wins only through a conditional pre-frontier transition and conflicts after the frontier;
  it never erases an attempt or claims that a possible provider impact was cancelled; and
- only the matching owner token may renew or finish `PROCESSING`, and every terminal transition clears
  active lease evidence without deleting lineage.

A validated no-impact retryable create failure may close the old attempt and insert exactly one successor.
Automatic policy is at most three total attempts with 5-second and then 30-second backoff. Immediate terminal
provider failures and every possible-impact outcome create no automatic successor. Network/timeout, create
5xx, malformed or mismatched success, SID-bearing error, success without SID, and local result-persistence
uncertainty are possible-impact `AMBIGUOUS` outcomes.

The only M5 production direct worker class is the exact `production-live-direct` label. It requires
`WORKER_ENABLED=true`, `LIVE_MESSAGING_ENABLED=true`, `MESSAGING_PROVIDER=twilio`, non-demo runtime, the
direct-worker authorization boundary, and current M4 stored account/credential/sender authority. The default
profile authorizes neither live direct nor live campaign work. Malformed, case-drifted, whitespace-padded,
unsupported, or campaign deployment classes fail closed. Installation-global Twilio environment credentials
and the isolated live-test route never authorize this worker.

ADMIN ambiguity review is outside automatic claiming. Provider reconciliation may fetch only a known SID
and can never create. Explicit `NOT_SENT` attestation conditionally closes one no-proof ambiguous attempt as
`RESOLVED_NOT_SENT`; a separate confirmed retry inserts at most one successor and leaves all prior evidence
intact. The successor follows ordinary due claiming and cannot bypass the final live gate.

## Post-MVP Local Worker Foundation

`npm run worker` processes due `SCHEDULED_CAMPAIGN` jobs only in local/demo runtimes when `MESSAGING_PROVIDER=dummy`, `LIVE_MESSAGING_ENABLED` is unset, empty, or exactly `false`, and no production-like runtime marker is present. Runtime-unknown or malformed live-messaging flag values must fail closed before worker jobs can process. The database worker must reject every production-like runtime marker (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV`) before provider or live-worker-class checks can fall through.
`WORKER_DEPLOYMENT_CLASS` may be unset or `local-demo` only. Any other deployment class is treated as a production worker attempt and is blocked before jobs are processed.
`production-live-campaign` is reserved as a future planning label only. It must remain blocked until a later milestone implements every frozen live-worker control in `lib/queue/live-worker-controls.ts` and keeps the controls aligned with `docs/PRODUCTION_WORKER_POLICY.md`. Public worker readiness must deny malformed runtime deployment-class values before provider fallthrough. Future authorization must deny unsupported, blank or whitespace-only, malformed primitive including bigint, malformed object including boxed booleans/numbers/`Symbol`/`BigInt`, dates, functions, tagged objects, and tagged-accessor objects, case-drifted, or whitespace-padded deployment class values before inspecting supplied control evidence, reject malformed, decorated, reordered-key, duplicate-key, hidden-required-field, hidden-string-field, hidden-symbol-field, inherited-field, inherited-extra-field, tampered-prototype, mutable-field, configurable-field, non-enumerable-public-field, non-ordinary built-in object-shaped including maps, sets, weak collections, typed arrays, data views, promises, boxed primitives, dates, regular expressions, errors, weak references, finalization registries, array/date/function-shaped, full or mixed symbol-keyed public-field impersonator, or proxy-invalid-public-field-descriptor wrapper input before inspecting supplied controls and without executing accessor-backed or inherited `Object.prototype` wrapper fields or letting descriptor, key, prototype, or frozen-state traps escape, require wrapper input to be frozen and expose only `workerDeploymentClass` and `controls` as frozen public data fields in exact order, reject nullish, malformed primitive, function-shaped, or object-shaped non-array `controls` evidence such as maps, proxy-backed maps, sets, proxy-backed sets, weak maps, proxy-backed weak maps, weak sets, proxy-backed weak sets, typed arrays, proxy-backed typed arrays, data views, proxy-backed data views, array buffers, proxy-backed array buffers, shared array buffers, proxy-backed shared array buffers, promises, proxy-backed promises, boxed primitives including boxed `Symbol` and boxed `BigInt`, proxy-backed boxed primitives including boxed `Symbol` and boxed `BigInt`, dates, proxy-backed dates, regular expressions, proxy-backed regular expressions, errors, proxy-backed errors, URLs, proxy-backed URLs, URLSearchParams, proxy-backed URLSearchParams, weak references, proxy-backed weak references, finalization registries, proxy-backed finalization registries, proxy-backed or revoked proxy non-array records, proxy-backed or revoked proxy-backed array-prototype impostors, array-like records, iterable objects, `Symbol.toStringTag` array impostors, or array-prototype impostors without invoking callable values, reading index, length, iterator, get, prototype, descriptor, or key traps, invoking iterator functions, falling back to built-in metadata, or coercing hostile values, then require frozen data descriptors, a frozen dense plain control array with only indexed data entries in exact ordinary array key order, a `length` descriptor matching the exact checklist size, no duplicate reflected array keys, no hidden string, custom iterator, data-backed custom iterator, custom async-iterator, data-backed custom async-iterator, own array method-name, or symbol control-array metadata, frozen ordinary-object control entries, own enumerable data fields only in exact `id`, `status`, `requirement` order, no symbol-keyed public-field impersonators, no hidden string or symbol control-entry metadata, no configurable control-entry public fields, no duplicate reflected control-entry keys, and the exact frozen checklist IDs and requirement text in order for the reserved class; malformed, nullish, malformed primitive entries, malformed primitive evidence, non-array, sparse, inherited-index-slot, accessor-slot, non-enumerable-index-slot, proxy-invalid-index-descriptor, hidden-required-field, missing-length-descriptor, nullish-length-descriptor, accessor-backed-length-descriptor, proxy-invalid-enumerable-length-descriptor, boxed-numeric-length-descriptor, mismatched-length-descriptor, oversized-length-descriptor, reordered-key proxy, duplicate-key proxy, malformed proxy-backed, revoked-proxy-backed, proxy-invalid-public-field-descriptor, decorated-array, array-subclass, tampered-prototype-array, mutable, sealed-but-writable, configurable-public-field, hidden-string-control-entry, hidden-symbol-control-entry, symbol-keyed-public-field-impersonator, missing, reordered, reordered-field, duplicate-entry-key, nullish-public-field-value, malformed-primitive-public-field-value, non-primitive-public-field-value including boxed string `id`, `status`, or `requirement` values, case-drifted or whitespace-padded public-string values, renamed, requirement-replaced, unsupported-status, extra-field, accessor-backed, getter-backed, prototype-backed, null-prototype, class-instance, array/date/function-shaped control entries, or partial control arrays must remain unauthorized even when their supplied statuses are otherwise `implemented`, exact frozen supplied control evidence, including descriptor-valid proxy-wrapped evidence, must be evaluated without executing authorization-wrapper, array, or entry `get` traps, inherited `Object.prototype` wrapper accessors, inherited array iterator hooks, coercing control public-field values, or normalizing control public-string values, and proxy reflection traps or revoked proxy targets on arrays, entries, controls evidence, or wrappers must deny cleanly.
Hidden string metadata on otherwise valid control arrays, control entries, or authorization wrappers is treated the same as hidden symbol metadata and must not authorize the reserved class. Hidden control-array metadata with accessor-backed getters or data-backed callable values must deny without reading or invoking that metadata. Hidden control-entry metadata with accessor-backed getters or data-backed callable values must deny without reading or invoking that metadata. Hidden authorization-wrapper metadata with accessor-backed getters or data-backed callable values must deny before supplied controls are inspected and without reading or invoking that metadata.
Exact frozen live-worker evidence must also remain independent from object-valued inherited `Object.prototype` metadata, including tag, iterator, well-known symbol, Object-helper, legacy accessor-helper, prototype-accessor, constructor, `toLocaleString`, hidden string or symbol, and coercion metadata, without invoking or coercing hostile metadata objects.
Own accessor-backed or data-backed `constructor` or `toLocaleString` metadata on otherwise valid supplied control arrays must deny before the reserved class can authorize and without reading, invoking, or coercing that metadata.
Sealed-but-writable authorization wrappers must deny before supplied controls are inspected; wrapper input must be frozen, not merely non-extensible.
Built-in and object-shaped deployment-class impostors, including maps, sets, weak collections, proxy-backed and revoked proxy-backed collection evidence, boxed primitives including proxy-backed and revoked proxy-backed boxed primitive evidence, array buffers, shared array buffers when runtime-supported, data views, proxy-backed and revoked proxy-backed array-buffer-shaped evidence, every runtime-supported typed-array constructor including proxy-backed and revoked proxy-backed typed-array evidence, dates including proxy-backed and revoked proxy-backed Date evidence, promises, regular expressions, errors, proxy-backed and revoked proxy-backed promise and error-shaped evidence, URL-shaped records, proxy-backed and revoked proxy-backed URL-shaped records, weak references, proxy-backed and revoked proxy-backed weak references, finalization registries, proxy-backed and revoked proxy-backed finalization registries, runtime-supported Web-platform records, runtime-supported WebAssembly records, runtime-supported Web Crypto records, inherited-coercion-hook records, proxy-backed and revoked proxy-backed runtime-supported platform records, proxy-backed or revoked proxy object values, and reflection-trapped proxy object values, must deny before supplied controls are inspected and without invoking `Symbol.toPrimitive`, `toString`, or `valueOf` or reading proxy `get`, prototype, descriptor, key, or frozen-state traps.
Proxy-backed built-in authorization-wrapper impostors must deny before supplied controls are inspected.
Exact-field, proxy-backed, and revoked proxy-backed non-ordinary authorization-wrapper impostors, including null-prototype, class-instance, array-shaped, function-shaped, and inherited-coercion-hook wrappers, must deny before supplied controls are inspected and without reading wrapper field getters or invoking inherited `Symbol.toPrimitive`, `toString`, or `valueOf`. Revoked proxy-backed plain authorization wrappers must also deny cleanly before hostile supplied controls are inspected.
Authorization wrappers with own coercion metadata, including accessor-backed `Symbol.toPrimitive`, `toString`, or `valueOf`, must deny before hostile supplied controls are inspected and without reading or invoking those hooks.
Authorization wrappers with own object-valued `Symbol.toStringTag`, `Symbol.toPrimitive`, `toString`, or `valueOf` metadata must deny before hostile supplied controls are inspected and without coercing those metadata objects.
Authorization wrappers with own object-valued `constructor` or `toLocaleString` metadata must deny before hostile supplied controls are inspected and without coercing those metadata objects.
Authorization wrappers with own object-valued `Symbol.iterator`, `Symbol.asyncIterator`, well-known symbol, Object-helper, legacy accessor-helper, or `__proto__` metadata must deny before hostile supplied controls are inspected and without coercing those metadata objects.
Reflection-trapped built-in authorization-wrapper impostors must deny cleanly before supplied controls are inspected and without descriptor, key, prototype, frozen-state, or get traps escaping.
ArrayBuffer and, when available, SharedArrayBuffer authorization-wrapper impostors must deny in ordinary, exact-field frozen, proxy-backed, and revoked proxy-backed forms before supplied controls are inspected.
Built-in authorization-wrapper impostors, including `Date` objects and boxed `Symbol`/`BigInt` primitives, with exact-looking frozen public data descriptors must still deny before supplied controls are inspected.
URL-shaped authorization-wrapper impostors, including `URL` and `URLSearchParams`, must deny in ordinary, exact-field frozen, proxy-backed, reflection-trapped, and revoked proxy-backed forms before supplied controls are inspected.
Revoked proxy-backed built-in authorization-wrapper impostors must deny cleanly before supplied controls are inspected or built-in metadata can be used as fallback evidence.
Proxy-backed non-array `controls` evidence, including array buffers, shared array buffers, URLs, URLSearchParams, weak references, and finalization registries, must deny before object `get`, prototype, descriptor, or key traps are read. Revoked proxy-backed built-in `controls` evidence must deny cleanly without falling back to built-in control metadata, including for typed arrays, data views, weak collections, URL-shaped controls evidence, and runtime-supported Web-platform records such as streams, events, channels, ports, queueing strategies, URL patterns, and performance observers.
Runtime-supported WebAssembly records must also deny as controls evidence and authorization-wrapper impostors before the reserved worker class can authorize, including proxy-backed and revoked proxy-backed evidence where applicable.
Runtime-supported Web Crypto records must also deny as controls evidence and authorization-wrapper impostors before the reserved worker class can authorize, including proxy-backed and revoked proxy-backed evidence where applicable.
Every runtime-supported typed-array constructor must deny as deployment-class evidence, including proxy-backed and revoked proxy-backed deployment-class evidence, direct controls evidence, and as an authorization-wrapper impostor before the reserved worker class can authorize.
Exact frozen supplied control entries must also be evaluated from own descriptors without reading inherited `Object.prototype` accessors for `id`, `status`, or `requirement`.
Exact frozen supplied control entries must also remain independent from inherited `Object.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` coercion metadata, including accessor-backed and data-backed callable metadata.
Exact frozen supplied control entries must also remain independent from inherited `Object.prototype` `Symbol.toStringTag` metadata, including data-backed callable metadata.
Exact frozen authorization-wrapper evidence must also remain independent from inherited `Object.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` coercion metadata, including accessor-backed and data-backed callable metadata, and inherited `Object.prototype` `Symbol.toStringTag` metadata, including data-backed callable metadata.
Exact frozen live-worker evidence must also remain independent from data-backed inherited `Object.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` callable metadata.
Exact frozen control-array density, descriptor-enumerability, scratch-array, and frozen evidence checks must also remain independent from inherited `Object.prototype[Symbol.iterator]` iterator metadata, `Object.prototype.toLocaleString` metadata, arbitrary inherited `Object.prototype` non-public string or symbol metadata, `Object.prototype.hasOwnProperty` ownership-helper, `Object.prototype.propertyIsEnumerable` enumerability-helper, `Object.prototype.isPrototypeOf` prototype-helper, `Object.prototype.constructor` metadata, `Object.prototype.__proto__` prototype-accessor metadata, and `Object.prototype` legacy accessor-helper metadata (`__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, and `__lookupSetter__`), including accessor-backed or data-backed callable metadata.
Exact frozen control-array evidence must also remain independent from inherited `Array.prototype` indexed accessors at occupied own checklist indexes or beyond the frozen checklist entries and inherited non-index string or symbol metadata.
Data-backed or object-valued inherited `Array.prototype` index slots must not fill sparse supplied control arrays, authorize the reserved worker deployment class, or coerce hostile inherited index-slot metadata.
Exact frozen control-array evidence must also remain authorized without invoking data-backed or coercing object-valued inherited `Array.prototype` index-slot metadata at occupied own checklist indexes or beyond the frozen checklist entries.
Whitespace-padded deployment class evidence includes leading spaces, trailing spaces, tabs, newlines, carriage returns, CRLF pairs, vertical tabs, form feeds, invisible Unicode escape padding, and Unicode line/paragraph separator padding, and must deny before supplied controls are inspected.
`Symbol.toStringTag` controls-evidence impostors with own or inherited accessor-backed tag metadata must deny without reading the tag, index, or length getters. Exact frozen control-array evidence must remain authorized without reading inherited `Array.prototype` `Symbol.toStringTag` metadata.
Own accessor-backed or data-backed `Symbol.toStringTag` authorization-wrapper metadata, plus inherited accessor-backed `Symbol.toStringTag` wrapper metadata, must deny before supplied controls are inspected and without reading tag getters or invoking callable metadata.
Own or inherited accessor-backed deployment-class metadata, including tag, iterator, well-known symbol, Object-helper, legacy accessor-helper, prototype-accessor, `constructor`, `toLocaleString`, or coercion metadata, must deny before supplied controls are inspected and without reading the metadata getter.
Inherited accessor-backed `Symbol.toStringTag` deployment-class metadata must deny before supplied controls are inspected and without reading the tag getter.
Object-shaped deployment-class values with own or inherited data-backed callable tag, iterator, well-known symbol, Object-helper, legacy accessor-helper, prototype-accessor, `constructor`, `toLocaleString`, or coercion metadata must deny before supplied controls are inspected and without invoking callable metadata.
Object-shaped deployment-class values with own or inherited object-valued tag, iterator, well-known symbol, Object-helper, legacy accessor-helper, prototype-accessor, `constructor`, `toLocaleString`, or coercion metadata must deny before supplied controls are inspected and without coercing those metadata objects.
Object-shaped deployment-class values with hidden own or inherited string or symbol metadata must deny before supplied controls are inspected and without reading accessor metadata, invoking callable metadata, or coercing object-valued metadata.
Control entries with own `Symbol.toStringTag`, `Symbol.toPrimitive`, `toString`, or `valueOf` metadata, including data-backed `Symbol.toStringTag`, accessor-backed coercion metadata, data-backed coercion metadata, and object-valued metadata with hostile coercion hooks, must deny without reading, invoking, or coercing those hooks.
Control arrays with own `Symbol.toStringTag`, `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.unscopables`, `Symbol.isConcatSpreadable`, string-method symbol metadata (`Symbol.match`, `Symbol.matchAll`, `Symbol.replace`, `Symbol.search`, or `Symbol.split`), array method-name metadata (`entries`, `keys`, `values`, `at`, `includes`, `indexOf`, `lastIndexOf`, `find`, `findIndex`, `findLast`, `findLastIndex`, `every`, `filter`, `flatMap`, `map`, `reduce`, `reduceRight`, `concat`, `copyWithin`, `fill`, `flat`, `forEach`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `some`, `sort`, `splice`, `unshift`, `toReversed`, `toSorted`, `toSpliced`, or `with`), `constructor`, `toLocaleString`, `Symbol.toPrimitive`, `toString`, or `valueOf` metadata must deny without reading or invoking those hooks. Own data-backed `Symbol.toStringTag`, iterator, async-iterator, coercion, well-known symbol, array method-name, `constructor`, and `toLocaleString` metadata with callable values must also deny without invocation, object-valued own `Symbol.toStringTag`, iterator, async-iterator, well-known symbol, array method-name, coercion, `constructor`, or `toLocaleString` metadata must deny without coercion, and exact frozen evidence must not coerce object-valued inherited `Array.prototype` metadata.
Exact frozen control-array evidence must also remain authorized without reading or invoking inherited `Array.prototype` Object-helper metadata (`hasOwnProperty`, `propertyIsEnumerable`, or `isPrototypeOf`), legacy accessor-helper metadata (`__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, or `__lookupSetter__`), prototype-accessor metadata (`__proto__`), and without invoking data-backed inherited index-slot metadata, non-index string or symbol metadata, `Array.prototype[Symbol.iterator]`, `Array.prototype[Symbol.asyncIterator]`, `Array.prototype[Symbol.toStringTag]`, `Array.prototype.constructor`, `Array.prototype.toLocaleString`, `Array.prototype[Symbol.unscopables]`, `Array.prototype[Symbol.isConcatSpreadable]`, string-method symbol metadata (`Symbol.match`, `Symbol.matchAll`, `Symbol.replace`, `Symbol.search`, or `Symbol.split`), iteration method metadata (`entries`, `keys`, or `values`), lookup method metadata (`at`, `includes`, `indexOf`, `lastIndexOf`, `find`, `findIndex`, `findLast`, or `findLastIndex`), quantifier metadata (`every`), transform/reducer method metadata (`filter`, `flatMap`, `map`, `reduce`, or `reduceRight`), mutator/visitor method metadata (`concat`, `copyWithin`, `fill`, `flat`, `forEach`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `some`, `sort`, `splice`, or `unshift`), copy-helper method metadata (`toReversed`, `toSorted`, `toSpliced`, or `with`), `Array.prototype[Symbol.toPrimitive]`, `Array.prototype.toString`, or `Array.prototype.valueOf` metadata, and without coercing object-valued inherited `Array.prototype` metadata across those categories, including inherited numeric index metadata at occupied own checklist indexes or beyond the frozen checklist entries.
Exact frozen control-array evidence must remain authorized without reading inherited `Array.prototype` `Symbol.toPrimitive`, `toString`, `valueOf`, `Symbol.toStringTag`, `Symbol.asyncIterator`, constructor, `toLocaleString`, `entries`, `keys`, `values`, lookup-method metadata (`at`, `includes`, `indexOf`, `lastIndexOf`, `find`, `findIndex`, `findLast`, or `findLastIndex`), quantifier metadata (`every`), transform/reducer metadata (`filter`, `flatMap`, `map`, `reduce`, or `reduceRight`), mutator/visitor metadata (`concat`, `copyWithin`, `fill`, `flat`, `forEach`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `some`, `sort`, `splice`, or `unshift`), copy-helper metadata (`toReversed`, `toSorted`, `toSpliced`, or `with`), `Symbol.unscopables`, `Symbol.isConcatSpreadable`, or string-method symbol metadata (`Symbol.match`, `Symbol.matchAll`, `Symbol.replace`, `Symbol.search`, or `Symbol.split`).

- The worker uses validated version-1 scheduled campaign payloads.
- Database polling and BullMQ consumption share one durable claim boundary. A due job must atomically transition from tenant-scoped `QUEUED` state—or recover an expired `PROCESSING` lease—to a new owner token before payload evaluation, recipient mutation, or provider calls.
- A concurrent worker that loses the conditional claim skips the job without provider calls or message mutations. The owner renews its lease before every provider call; only the matching token may renew or transition the job, and terminal transitions clear lease evidence.
- A worker crash leaves an expiring claim rather than a permanently stuck job. Database polling includes expired processing leases, while BullMQ retries active-lease, early-delivery, blocked-runtime, and uncertain processing outcomes after bounded attempts/backoff.
- Invalid payloads or missing scheduled campaigns are marked `FAILED`.
- Due jobs whose payload `scheduledAt` no longer matches the campaign's active `scheduledAt` are marked `CANCELLED` without sending, mutating recipients, or creating message rows.
- Valid due jobs re-run recipient preflight at send time. Recipients that became archived, non-opted-in, or opted out after scheduling are marked `BLOCKED` and skipped; allowed recipients still create idempotent outbound `Message` rows with the dummy provider message ID and returned provider status.
- Queue failure/completion plus the matching tenant campaign pause/completion must commit in one database transaction, guarded by owner token, scheduled campaign state, and exact schedule timestamp. A lost owner or changed schedule cannot leave a completed queue job split from campaign state.
- Jobs are marked `FAILED` and campaigns are paused only when no sendable recipients remain after the send-time preflight.
- Outbound message idempotency is scoped by `(orgId, idempotencyKey)`, and worker-generated outbound key strings include `orgId`, queue job ID, and contact ID before provider calls so retries cannot collide across tenants or provider request evidence.
- Completed jobs are marked `COMPLETED`; campaigns are marked `COMPLETED`.
- Unexpected processing errors mark the claimed job `FAILED`, pause its matching tenant campaign when still scheduled, and allow the polling loop to continue to later jobs.
- The worker must not call Twilio or any live provider.

## Post-MVP Continuous Local Worker

Continuous execution is opt-in and remains local/demo-safe:

- `npm run worker` performs one processing pass and exits.
- `npm run worker:watch` or `WORKER_MODE=continuous npm run worker` polls repeatedly.
- `WORKER_POLL_INTERVAL_MS` controls the poll delay and is clamped to a safe minimum.
- `WORKER_MAX_ITERATIONS` may cap local/test loops.
- `WORKER_MAX_JOBS_PER_POLL` caps due jobs processed per poll and is clamped between 1 and 100.
- Every poll reuses the same dummy-only/live-disabled gate; blocked workers do not process or call providers.
- Production-like runtime markers (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV` set to `production` or `prod`) and non-`local-demo` `WORKER_DEPLOYMENT_CLASS` values block worker processing even when demo-safe provider defaults are set. Production worker execution requires a future explicit worker policy, not the general production external-impact override.
- `docs/PRODUCTION_WORKER_POLICY.md` is the current planning gate for that future explicit policy. It defines the reserved live-worker control checklist, and `lib/queue/live-worker-controls.ts` pins that checklist as frozen executable metadata, but neither authorizes production worker execution or live campaign sends.

## Post-MVP BullMQ/Redis Enqueue Foundation

Durable `QueueJob` rows remain the source of truth. BullMQ is an optional delivery accelerator only:

- Default queue backend is `database`; BullMQ is disabled unless `QUEUE_BACKEND=bullmq`.
- BullMQ enqueue also requires `REDIS_URL`; missing Redis configuration must not break campaign scheduling.
- BullMQ job names and payloads must use the same validated scheduled-campaign payload contract as `QueueJob.payload`.
- BullMQ job IDs must use the colon-free `<QueueJob.id>-<QueueJob.generation>` pair. Repeated mirror
  attempts for one generation remain idempotent, while a reopened durable row cannot be suppressed
  by its retained completed/failed BullMQ entry. The tenant-scoped `QueueJob.idempotencyKey` remains
  the database idempotency boundary and must not be passed as a BullMQ custom job ID because BullMQ
  rejects colon-delimited IDs.
- Campaign scheduling responses must surface the optional BullMQ mirror outcome; a mirror failure
  must never be reported as a successful BullMQ enqueue or erase the durable database job.
- Redis URL parsing, queue construction, enqueue, metrics, and queue close failures must be contained inside the best-effort mirror result; none may make the already committed database schedule appear rolled back.
- BullMQ enqueue must not call providers, send SMS, enable live messaging, store secrets, or replace database idempotency.
- Local validation must pass without Redis running.

## Post-MVP BullMQ Worker Consumption Foundation

BullMQ workers may consume scheduled-campaign queue events only by referencing durable database jobs:

- BullMQ worker payloads must include `queueJobId` plus the version-1 scheduled-campaign payload.
- The BullMQ worker must reload and process the matching `QueueJob` row from the database.
- Cancelled, completed, missing, invalid, or durably failed jobs must terminate locally without provider calls. Early, active-lease, blocked-runtime, or uncertain-processing results are recoverable and must throw from the BullMQ processor so attempts/backoff apply instead of acknowledging the mirror event.
- Worker startup is blocked unless `QUEUE_BACKEND=bullmq`, `REDIS_URL` is configured, `MESSAGING_PROVIDER=dummy`, `LIVE_MESSAGING_ENABLED` is not `true`, and no production-like runtime marker is present. BullMQ worker readiness must reject every production-like runtime marker before provider or live-worker-class checks can fall through.
- BullMQ worker startup also rejects any `WORKER_DEPLOYMENT_CLASS` other than `local-demo`.
- BullMQ worker startup must continue to reject `WORKER_DEPLOYMENT_CLASS=production-live-campaign` until every frozen future live-worker control is implemented.
- Every exported BullMQ worker startup or direct worker-construction helper must enforce the same BullMQ backend, Redis, provider, live-messaging, production-runtime, and worker-deployment-class readiness gate before constructing a worker.
- The BullMQ worker must use the same dummy-only send path and idempotent `Message` rows as the database polling worker.

## Post-MVP BullMQ/Redis Smoke

`npm run queue:bullmq:smoke` is an optional operator check:

- It skips successfully unless `QUEUE_BACKEND=bullmq` and `REDIS_URL` are both configured.
- When enabled, it writes and removes one job in the dedicated `signalstack-bullmq-smoke` queue.
- It must not touch scheduled campaign queues, database `QueueJob` rows, providers, SMS sends, billing, secrets, or live messaging flags.
- The default validation gate must not require Redis.

## Post-MVP Queue Operations Metadata

`/settings/queue` may display local worker command references, but it must not execute them.

- Supported command references are `npm run worker`, `npm run worker:watch`, `npm run worker:bullmq`, and `npm run queue:bullmq:smoke`.
- Supported worker modes are `database one-shot`, `database continuous`, `bullmq worker`, and `bullmq smoke`; the mode vocabulary must be exported, runtime-frozen, and aligned with the rendered worker command metadata.
- Command references must remain backed by `package.json` scripts.
- Static queue operations metadata must be frozen, public-field only, secret-free, command-literal-free outside the allowlisted command reference field, and explicit that command execution, external impact, mutation, and secret display are `none`.
- Safety-boundary copy must continue to state that the page does not enqueue jobs, run workers, call Redis/providers, bill, notify, send SMS, mutate queue rows, or update campaign status.
