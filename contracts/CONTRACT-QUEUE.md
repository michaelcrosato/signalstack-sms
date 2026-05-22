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

`POST /api/campaigns/:campaignId/schedule` creates or updates a queued job only after campaign preflight passes. `POST /api/campaigns/:campaignId/cancel` marks queued jobs cancelled and pauses the campaign.

Milestone 4 does not call live providers.

## Post-MVP Local Worker Foundation

`npm run worker` processes due `SCHEDULED_CAMPAIGN` jobs only in local/demo runtimes when `MESSAGING_PROVIDER=dummy`, `LIVE_MESSAGING_ENABLED` is unset, empty, or exactly `false`, and no production-like runtime marker is present. Runtime-unknown or malformed live-messaging flag values must fail closed before worker jobs can process. The database worker must reject every production-like runtime marker (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV`) before provider or live-worker-class checks can fall through.
`WORKER_DEPLOYMENT_CLASS` may be unset or `local-demo` only. Any other deployment class is treated as a production worker attempt and is blocked before jobs are processed.
`production-live-campaign` is reserved as a future planning label only. It must remain blocked until a later milestone implements every frozen live-worker control in `lib/queue/live-worker-controls.ts` and keeps the controls aligned with `docs/PRODUCTION_WORKER_POLICY.md`. Public worker readiness must deny malformed runtime deployment-class values before provider fallthrough. Future authorization must deny unsupported or malformed deployment class values before inspecting supplied control evidence, reject malformed, decorated, reordered-key, hidden-required-field, inherited-field, inherited-extra-field, mutable-field, or configurable-field wrapper input before inspecting supplied controls and without executing accessor-backed fields or letting descriptor, key, prototype, or frozen-state traps escape, require wrapper input to be frozen and expose only `workerDeploymentClass` and `controls` as frozen public data fields in exact order, reject nullish `controls` evidence without falling back to built-in metadata, then require frozen data descriptors, a frozen dense plain control array with only indexed data entries in exact ordinary array key order, frozen ordinary-object control entries, own enumerable data fields only in exact `id`, `status`, `requirement` order, and the exact frozen checklist IDs and requirement text in order for the reserved class; malformed, nullish, non-array, sparse, accessor-slot, non-enumerable-index-slot, hidden-required-field, reordered-key proxy, proxy-backed, decorated-array, array-subclass, mutable, missing, reordered, reordered-field, renamed, requirement-replaced, unsupported-status, extra-field, accessor-backed, getter-backed, prototype-backed, null-prototype, class-instance, or partial control arrays must remain unauthorized even when their supplied statuses are otherwise `implemented`, exact frozen supplied control evidence must be evaluated without executing array or entry `get` traps, and proxy reflection traps on arrays, entries, or wrappers must deny cleanly.

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
