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

`npm run worker` processes due `SCHEDULED_CAMPAIGN` jobs only when `MESSAGING_PROVIDER=dummy` and `LIVE_MESSAGING_ENABLED` is not `true`.

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
- Worker startup is blocked unless `QUEUE_BACKEND=bullmq`, `REDIS_URL` is configured, `MESSAGING_PROVIDER=dummy`, and `LIVE_MESSAGING_ENABLED` is not `true`.
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
