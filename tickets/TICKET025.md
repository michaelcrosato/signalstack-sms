# TICKET025 — Campaign management & scheduling engine

- **Milestone:** M7
- **Status:** Done
- **Priority:** P1

## Goal
Implement full production campaign lifecycle, audience segment resolution, timezone-aware scheduling, transactional outbox dispatch, backpressure rate limiting, and emergency kill switches.

## Context
Durable database queue job substrates exist in `lib/queue/worker.ts`. M7 builds the end-to-end campaign sending engine that expands targeted audiences, resolves consent at dispatch time, queues per-recipient delivery attempts, respects provider throughput limits, handles worker restarts gracefully, and supports cancellation/pause during execution.

## Scope
- **In:** Tag/list/segment evaluation and snapshotting, campaign scheduling and timezone dispatch, transactional per-recipient `MessageAttempt` outbox enqueueing, provider concurrency and rate limiting, worker heartbeat and graceful shutdown, kill switch controls.
- **Out:** External SQS or hosted queue SaaS; paid carrier sends in CI.

## Likely files
`lib/queue/worker.ts`, `lib/queue/live-worker-controls.ts`, `lib/db/queue-dispatch.ts`, `app/api/campaigns/route.ts`, `tests/unit/db/worker-runtime-dispatch.test.ts`.

## Acceptance criteria
- [x] Campaign segment resolution creates immutable audience snapshots prior to dispatch.
- [x] Recipient consent and quiet hours are re-checked immediately before each message attempt enqueue.
- [x] Rate limits and provider throughput bounds are strictly obeyed by the background worker.
- [x] Worker restart or crash recovery resumes queued campaign attempts without double-sending or skipping recipients.
- [x] Global and per-organization emergency kill switch immediately stops active campaign workers.
- [x] Unit and database queue tests pass.

## Commands
`npm test -- worker-runtime-dispatch`, `npm run standalone:check`, `npm run validate`
