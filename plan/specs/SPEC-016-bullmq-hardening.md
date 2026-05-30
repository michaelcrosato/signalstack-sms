# SPEC-016 — BullMQ Worker Production Hardening

- **Status:** Todo · **Priority:** P2 · **Pillar:** Quality (infra) · **Effort:** S

## Description
Harden the BullMQ queue and worker configuration to support production resilience. This includes:
1. Configuring graceful worker shutdown on `SIGTERM` and `SIGINT` signals by invoking `worker.close()`.
2. Adjusting job retention TTLs (`removeOnComplete`, `removeOnFail`) to avoid unbounded Redis memory growth while keeping failed jobs for 7 days and completed jobs for 24 hours for auditability.
3. Adding configurable lock parameters (`lockDuration`, `stalledInterval`) to the Worker constructor to prevent double-execution of campaigns due to false stalled triggers.
4. Hooking worker monitoring listeners (`worker.on("failed")`, `worker.on("error")`) into the centralized logging/metrics pipelines.

## Prereqs / deps
None. Standard BullMQ APIs are fully compatible.

## Implementation approach
1. Add `lockDuration`, `stalledInterval`, and graceful close handling to `lib/queue/bullmq-worker.ts`.
2. In `lib/queue/bullmq-worker.ts`, hook into system signals (`SIGTERM`, `SIGINT`) to call `.close()` on the active worker instance.
3. In `lib/queue/bullmq.ts`, adjust `JobsOptions` inside `buildScheduledCampaignBullMqJob` to:
   - `removeOnComplete: { age: 24 * 3600 }` (retain for 24h)
   - `removeOnFail: { age: 7 * 24 * 3600 }` (retain for 7d)
4. Wire worker event listeners in `lib/queue/bullmq-worker.ts` to log via `lib/observability/logger` and record metrics on job completion or failure.
5. Add unit tests verifying option parsing and signal hooking.

## Acceptance criteria
- [ ] SIGTERM/SIGINT hooks call `worker.close()` and shut down gracefully.
- [ ] Job options retain failed jobs for 7 days and completed jobs for 24 hours.
- [ ] Lock duration defaults are defined and configurable.
- [ ] Worker logs errors and job failures securely.
- [ ] `npm run validate` passes completely green.

## Test strategy
- Unit tests in `tests/unit/queue/bullmq-worker.test.ts` verifying option structures and metric dispatch.
