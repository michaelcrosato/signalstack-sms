# Queue Contract

Owner: backend-data.

Jobs must use validated payloads and idempotency keys.

## Milestone 4 Foundation

Queue job records are persisted in `QueueJob` before any worker/provider behavior:

- `type`: `SCHEDULED_CAMPAIGN`
- `status`: `QUEUED`, `CANCELLED`, `COMPLETED`, `FAILED`
- `idempotencyKey`: stable retry key unique with `orgId`
- `payload`: validated JSON payload
- `runAt`: scheduled execution time

`POST /api/campaigns/:campaignId/schedule` creates or updates a queued job only after campaign preflight passes. `POST /api/campaigns/:campaignId/cancel` marks queued jobs cancelled and pauses scheduled campaigns only; missing campaigns return not found, and existing non-scheduled campaigns reject without queue or campaign mutations.

Milestone 4 does not call live providers.

## Post-MVP Local Worker Foundation

`npm run worker` processes due `SCHEDULED_CAMPAIGN` jobs only in local/demo runtimes when `MESSAGING_PROVIDER=dummy`, `LIVE_MESSAGING_ENABLED` is unset, empty, or exactly `false`, and no production-like runtime marker is present. Runtime-unknown or malformed live-messaging flag values must fail closed before worker jobs can process. The database worker must reject every production-like runtime marker (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV`) before provider or live-worker-class checks can fall through.
`WORKER_DEPLOYMENT_CLASS` may be unset or `local-demo` only. Any other deployment class is treated as a production worker attempt and is blocked before jobs are processed.
`production-live-campaign` is reserved as a future planning label only. It must remain blocked until a later milestone implements every frozen live-worker control in `lib/queue/live-worker-controls.ts` and keeps the controls aligned with `docs/PRODUCTION_WORKER_POLICY.md`. Public worker readiness must deny malformed runtime deployment-class values before provider fallthrough. Future authorization must deny unsupported, blank or whitespace-only, malformed primitive including bigint, malformed object including boxed booleans/numbers/`Symbol`/`BigInt`, dates, functions, tagged objects, and tagged-accessor objects, case-drifted, or whitespace-padded deployment class values before inspecting supplied control evidence, reject malformed, decorated, reordered-key, duplicate-key, hidden-required-field, hidden-string-field, hidden-symbol-field, inherited-field, inherited-extra-field, tampered-prototype, mutable-field, configurable-field, non-enumerable-public-field, non-ordinary built-in object-shaped including maps, sets, weak collections, typed arrays, data views, promises, boxed primitives, dates, regular expressions, errors, weak references, finalization registries, array/date/function-shaped, full or mixed symbol-keyed public-field impersonator, or proxy-invalid-public-field-descriptor wrapper input before inspecting supplied controls and without executing accessor-backed or inherited `Object.prototype` wrapper fields or letting descriptor, key, prototype, or frozen-state traps escape, require wrapper input to be frozen and expose only `workerDeploymentClass` and `controls` as frozen public data fields in exact order, reject nullish, malformed primitive, function-shaped, or object-shaped non-array `controls` evidence such as maps, proxy-backed maps, sets, proxy-backed sets, weak maps, proxy-backed weak maps, weak sets, proxy-backed weak sets, typed arrays, proxy-backed typed arrays, data views, proxy-backed data views, array buffers, proxy-backed array buffers, shared array buffers, proxy-backed shared array buffers, promises, proxy-backed promises, boxed primitives including boxed `Symbol` and boxed `BigInt`, proxy-backed boxed primitives including boxed `Symbol` and boxed `BigInt`, dates, proxy-backed dates, regular expressions, proxy-backed regular expressions, errors, proxy-backed errors, URLs, proxy-backed URLs, URLSearchParams, proxy-backed URLSearchParams, weak references, proxy-backed weak references, finalization registries, proxy-backed finalization registries, proxy-backed or revoked proxy non-array records, proxy-backed or revoked proxy-backed array-prototype impostors, array-like records, iterable objects, `Symbol.toStringTag` array impostors, or array-prototype impostors without invoking callable values, reading index, length, iterator, get, prototype, descriptor, or key traps, invoking iterator functions, falling back to built-in metadata, or coercing hostile values, then require frozen data descriptors, a frozen dense plain control array with only indexed data entries in exact ordinary array key order, a `length` descriptor matching the exact checklist size, no duplicate reflected array keys, no hidden string, custom iterator, data-backed custom iterator, custom async-iterator, data-backed custom async-iterator, own array method-name, or symbol control-array metadata, frozen ordinary-object control entries, own enumerable data fields only in exact `id`, `status`, `requirement` order, no symbol-keyed public-field impersonators, no hidden string or symbol control-entry metadata, no configurable control-entry public fields, no duplicate reflected control-entry keys, and the exact frozen checklist IDs and requirement text in order for the reserved class; malformed, nullish, malformed primitive entries, malformed primitive evidence, non-array, sparse, inherited-index-slot, accessor-slot, non-enumerable-index-slot, proxy-invalid-index-descriptor, hidden-required-field, missing-length-descriptor, nullish-length-descriptor, accessor-backed-length-descriptor, proxy-invalid-enumerable-length-descriptor, boxed-numeric-length-descriptor, mismatched-length-descriptor, oversized-length-descriptor, reordered-key proxy, duplicate-key proxy, malformed proxy-backed, revoked-proxy-backed, proxy-invalid-public-field-descriptor, decorated-array, array-subclass, tampered-prototype-array, mutable, sealed-but-writable, configurable-public-field, hidden-string-control-entry, hidden-symbol-control-entry, symbol-keyed-public-field-impersonator, missing, reordered, reordered-field, duplicate-entry-key, nullish-public-field-value, malformed-primitive-public-field-value, non-primitive-public-field-value including boxed string `id`, `status`, or `requirement` values, case-drifted or whitespace-padded public-string values, renamed, requirement-replaced, unsupported-status, extra-field, accessor-backed, getter-backed, prototype-backed, null-prototype, class-instance, array/date/function-shaped control entries, or partial control arrays must remain unauthorized even when their supplied statuses are otherwise `implemented`, exact frozen supplied control evidence, including descriptor-valid proxy-wrapped evidence, must be evaluated without executing authorization-wrapper, array, or entry `get` traps, inherited `Object.prototype` wrapper accessors, inherited array iterator hooks, coercing control public-field values, or normalizing control public-string values, and proxy reflection traps or revoked proxy targets on arrays, entries, controls evidence, or wrappers must deny cleanly.
Hidden string metadata on otherwise valid control entries or authorization wrappers is treated the same as hidden symbol metadata and must not authorize the reserved class.
Sealed-but-writable authorization wrappers must deny before supplied controls are inspected; wrapper input must be frozen, not merely non-extensible.
Built-in and object-shaped deployment-class impostors, including maps, sets, weak collections, proxy-backed and revoked proxy-backed collection evidence, boxed primitives including proxy-backed and revoked proxy-backed boxed primitive evidence, array buffers, shared array buffers when runtime-supported, data views, proxy-backed and revoked proxy-backed array-buffer-shaped evidence, every runtime-supported typed-array constructor including proxy-backed and revoked proxy-backed typed-array evidence, dates including proxy-backed and revoked proxy-backed Date evidence, promises, regular expressions, errors, proxy-backed and revoked proxy-backed promise and error-shaped evidence, URL-shaped records, proxy-backed and revoked proxy-backed URL-shaped records, weak references, proxy-backed and revoked proxy-backed weak references, finalization registries, proxy-backed and revoked proxy-backed finalization registries, runtime-supported Web-platform records, runtime-supported WebAssembly records, runtime-supported Web Crypto records, inherited-coercion-hook records, proxy-backed and revoked proxy-backed runtime-supported platform records, proxy-backed or revoked proxy object values, and reflection-trapped proxy object values, must deny before supplied controls are inspected and without invoking `Symbol.toPrimitive`, `toString`, or `valueOf` or reading proxy `get`, prototype, descriptor, key, or frozen-state traps.
Proxy-backed built-in authorization-wrapper impostors must deny before supplied controls are inspected.
Exact-field, proxy-backed, and revoked proxy-backed non-ordinary authorization-wrapper impostors, including null-prototype, class-instance, array-shaped, function-shaped, and inherited-coercion-hook wrappers, must deny before supplied controls are inspected and without reading wrapper field getters or invoking inherited `Symbol.toPrimitive`, `toString`, or `valueOf`. Revoked proxy-backed plain authorization wrappers must also deny cleanly before hostile supplied controls are inspected.
Authorization wrappers with own coercion metadata, including accessor-backed `Symbol.toPrimitive`, `toString`, or `valueOf`, must deny before hostile supplied controls are inspected and without reading or invoking those hooks.
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
Exact frozen supplied control entries must also remain independent from inherited `Object.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` coercion metadata.
Exact frozen supplied control entries must also remain independent from inherited `Object.prototype` `Symbol.toStringTag` metadata, including data-backed callable metadata.
Exact frozen authorization-wrapper evidence must also remain independent from inherited `Object.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` coercion metadata and inherited `Object.prototype` `Symbol.toStringTag` metadata, including data-backed callable metadata.
Exact frozen control-array density, descriptor-enumerability, and frozen evidence checks must also remain independent from inherited `Object.prototype.hasOwnProperty` ownership-helper, `Object.prototype.propertyIsEnumerable` enumerability-helper, and `Object.prototype.isPrototypeOf` prototype-helper metadata, including accessor-backed or data-backed callable metadata.
Exact frozen control-array evidence must also remain independent from inherited `Array.prototype` indexed accessors beyond the frozen checklist entries and inherited non-index string or symbol metadata.
Whitespace-padded deployment class evidence includes leading spaces, trailing spaces, tabs, newlines, carriage returns, CRLF pairs, vertical tabs, form feeds, invisible Unicode escape padding, and Unicode line/paragraph separator padding, and must deny before supplied controls are inspected.
`Symbol.toStringTag` controls-evidence impostors with own or inherited accessor-backed tag metadata must deny without reading the tag, index, or length getters. Exact frozen control-array evidence must remain authorized without reading inherited `Array.prototype` `Symbol.toStringTag` metadata.
Own or inherited accessor-backed `Symbol.toStringTag` authorization-wrapper metadata must deny before supplied controls are inspected and without reading the tag getter.
Inherited accessor-backed `Symbol.toStringTag` deployment-class metadata must deny before supplied controls are inspected and without reading the tag getter.
Control entries with own `Symbol.toStringTag`, `Symbol.toPrimitive`, `toString`, or `valueOf` metadata, including accessor-backed coercion metadata, must deny without reading or invoking those hooks.
Control arrays with own `Symbol.toStringTag`, `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.unscopables`, `Symbol.isConcatSpreadable`, string-method symbol metadata (`Symbol.match`, `Symbol.matchAll`, `Symbol.replace`, `Symbol.search`, or `Symbol.split`), array method-name metadata (`entries`, `keys`, `values`, `at`, `includes`, `indexOf`, `lastIndexOf`, `find`, `findIndex`, `findLast`, `findLastIndex`, `every`, `filter`, `flatMap`, `map`, `reduce`, `reduceRight`, `concat`, `copyWithin`, `fill`, `flat`, `forEach`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `some`, `sort`, `splice`, `unshift`, `toReversed`, `toSorted`, `toSpliced`, or `with`), `Symbol.toPrimitive`, `toString`, or `valueOf` metadata must deny without reading or invoking those hooks. Own data-backed `Symbol.toStringTag`, iterator, async-iterator, coercion, well-known symbol, and array method-name metadata with callable values must also deny without invocation.
Exact frozen control-array evidence must also remain authorized without invoking data-backed inherited non-index string or symbol metadata, `Array.prototype[Symbol.iterator]`, `Array.prototype[Symbol.asyncIterator]`, `Array.prototype[Symbol.toStringTag]`, `Array.prototype.constructor`, `Array.prototype[Symbol.unscopables]`, `Array.prototype[Symbol.isConcatSpreadable]`, string-method symbol metadata (`Symbol.match`, `Symbol.matchAll`, `Symbol.replace`, `Symbol.search`, or `Symbol.split`), iteration method metadata (`entries`, `keys`, or `values`), lookup method metadata (`at`, `includes`, `indexOf`, `lastIndexOf`, `find`, `findIndex`, `findLast`, or `findLastIndex`), quantifier metadata (`every`), transform/reducer method metadata (`filter`, `flatMap`, `map`, `reduce`, or `reduceRight`), mutator/visitor method metadata (`concat`, `copyWithin`, `fill`, `flat`, `forEach`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `some`, `sort`, `splice`, or `unshift`), copy-helper method metadata (`toReversed`, `toSorted`, `toSpliced`, or `with`), `Array.prototype[Symbol.toPrimitive]`, `Array.prototype.toString`, or `Array.prototype.valueOf` metadata.
Exact frozen control-array evidence must remain authorized without reading inherited `Array.prototype` `Symbol.toPrimitive`, `toString`, `valueOf`, `Symbol.toStringTag`, `Symbol.asyncIterator`, constructor, `entries`, `keys`, `values`, lookup-method metadata (`at`, `includes`, `indexOf`, `lastIndexOf`, `find`, `findIndex`, `findLast`, or `findLastIndex`), quantifier metadata (`every`), transform/reducer metadata (`filter`, `flatMap`, `map`, `reduce`, or `reduceRight`), mutator/visitor metadata (`concat`, `copyWithin`, `fill`, `flat`, `forEach`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `some`, `sort`, `splice`, or `unshift`), copy-helper metadata (`toReversed`, `toSorted`, `toSpliced`, or `with`), `Symbol.unscopables`, `Symbol.isConcatSpreadable`, or string-method symbol metadata (`Symbol.match`, `Symbol.matchAll`, `Symbol.replace`, `Symbol.search`, or `Symbol.split`).

- The worker uses validated version-1 scheduled campaign payloads.
- Invalid payloads or missing scheduled campaigns are marked `FAILED`.
- Valid due jobs create idempotent outbound `Message` rows through the dummy provider.
- Outbound message idempotency is scoped by `(orgId, idempotencyKey)` so retries cannot collide across tenants.
- Completed jobs are marked `COMPLETED`; campaigns are marked `COMPLETED`.
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
- BullMQ job IDs must use the durable `QueueJob.idempotencyKey`.
- BullMQ enqueue must not call providers, send SMS, enable live messaging, store secrets, or replace database idempotency.
- Local validation must pass without Redis running.

## Post-MVP BullMQ Worker Consumption Foundation

BullMQ workers may consume scheduled-campaign queue events only by referencing durable database jobs:

- BullMQ worker payloads must include `queueJobId` plus the version-1 scheduled-campaign payload.
- The BullMQ worker must reload and process the matching `QueueJob` row from the database.
- Cancelled, completed, missing, invalid, or early jobs must be skipped or failed locally without provider calls.
- Worker startup is blocked unless `QUEUE_BACKEND=bullmq`, `REDIS_URL` is configured, `MESSAGING_PROVIDER=dummy`, `LIVE_MESSAGING_ENABLED` is not `true`, and no production-like runtime marker is present. BullMQ worker readiness must reject every production-like runtime marker before provider or live-worker-class checks can fall through.
- BullMQ worker startup also rejects any `WORKER_DEPLOYMENT_CLASS` other than `local-demo`.
- BullMQ worker startup must continue to reject `WORKER_DEPLOYMENT_CLASS=production-live-campaign` until every frozen future live-worker control is implemented.
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
