# Architecture

Stack defaults: Next.js App Router, TypeScript strict mode, PostgreSQL, Prisma, Zod, Vitest, Playwright, Tailwind CSS, BullMQ/Redis-ready workers, dummy SMS provider, fake AI provider, and CI validation. [DEFAULT]

Post-MVP local workers support one-shot and opt-in continuous polling modes. Continuous mode is for local/demo execution only and reuses the dummy-provider hard gate before every poll.

Post-MVP BullMQ support is opt-in. `QueueJob` database rows remain durable state, while `QUEUE_BACKEND=bullmq` with `REDIS_URL` can mirror scheduled campaign jobs into a Redis-backed BullMQ queue for future worker execution. Missing Redis configuration falls back to database-only scheduling.

The optional BullMQ worker consumes Redis jobs by `queueJobId` and reloads the durable `QueueJob` row before processing. It shares the local dummy-provider hard gate with the database polling worker.

`npm run queue:bullmq:smoke` is an optional Redis connectivity check. It uses a dedicated smoke queue and is skipped unless `QUEUE_BACKEND=bullmq` and `REDIS_URL` are configured, so the default validation path remains database-only.

Post-MVP API rate limiting is enforced in Next middleware with an in-memory fixed-window limiter. It is a local/demo safety guardrail for abuse-prone API bursts; it does not rely on Redis, does not call external services, and does not replace durable idempotency for queue jobs or webhooks.

Production-like deployments are allowed only as demo-safe deployments today. `npm run production:gate` blocks live messaging, live billing, live provider, live AI, Twilio, and Stripe configuration unless a future controlled go-live milestone explicitly enables external impact. The operator checklist is documented in `docs/PRODUCTION_GO_LIVE.md`.
