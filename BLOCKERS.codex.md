# Codex Blockers

Run number: 6

No active blockers.

## Notes

- `codex-runs/FULL_PLAN_RUN_6.md` was already untracked at the start of this run and contains the run prompt.
- The demo path requires the local PostgreSQL database to be migrated and seeded before running.
- The standard `npm run validate` gate runs the smoke Playwright test; the fuller investor demo path is available as `npm run test:e2e:demo`.
- Webhook foundations validate and store Twilio inbound/status events. Status webhooks now update local message delivery metadata.
- Provider settings are read-only readiness metadata. Provider phone-number metadata is local-only and does not prove ownership or provision Twilio numbers.
- Live-readiness audit events are local records only and now appear on the `/settings` go-live readiness page.
- There is still no provider credential storage UI, live send enablement flow, or real Twilio send path.
- The local worker processes due scheduled campaigns through the dummy provider only. Continuous polling, local jobs-per-poll limits, and opt-in BullMQ enqueue/consumption foundations are available for demos.
- BullMQ enqueue and worker consumption are now available as opt-in local foundations with `QUEUE_BACKEND=bullmq` and `REDIS_URL`; local validation still does not require Redis.
- The BullMQ worker has unit coverage and a guarded startup path, but this run did not perform an end-to-end Redis-backed BullMQ integration test against a running Redis service.
- Production deployment gates are local validation checks only; they do not provision deployment infrastructure or enable live external services.
- Windows can produce a Prisma client DLL rename error if `prisma generate` runs concurrently with a Next/Playwright server or another Prisma client process. Run Prisma generation and E2E checks sequentially.
