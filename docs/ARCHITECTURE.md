# Architecture

Stack defaults: Next.js App Router, TypeScript strict mode, PostgreSQL, Prisma, Zod, Vitest, Playwright, Tailwind CSS, BullMQ/Redis-ready workers, dummy SMS provider, fake AI provider, and CI validation. [DEFAULT]

Post-MVP local workers support one-shot and opt-in continuous polling modes. Continuous mode is for local/demo execution only and reuses the dummy-provider hard gate before every poll.

Post-MVP BullMQ support is opt-in. `QueueJob` database rows remain durable state, while `QUEUE_BACKEND=bullmq` with `REDIS_URL` can mirror scheduled campaign jobs into a Redis-backed BullMQ queue for future worker execution. A monotonic durable generation gives each reopened row a fresh BullMQ ID without weakening same-generation idempotency. Missing Redis configuration falls back to database-only scheduling.

The optional BullMQ worker consumes Redis jobs by `queueJobId` and reloads the durable `QueueJob` row before processing. It acknowledges only completed or durably terminal database outcomes; recoverable lease, timing, runtime-gate, and uncertain-processing outcomes use BullMQ attempts/backoff. It shares the local dummy-provider hard gate with the database polling worker.

`npm run queue:bullmq:smoke` is an optional Redis connectivity check. It uses a dedicated smoke queue and is skipped unless `QUEUE_BACKEND=bullmq` and `REDIS_URL` are configured, so the default validation path remains database-only.

Post-MVP API rate limiting is enforced in Next middleware with an in-memory fixed-window limiter. It is a local/demo safety guardrail for abuse-prone API bursts; it does not rely on Redis, does not call external services, and does not replace durable idempotency for queue jobs or webhooks.

Contact phone normalization is local-only by default. The single-contact validation seam may call paid Twilio Lookup only with exact live enablement, explicit cost acknowledgement, complete environment credentials, a constant-time match between the dedicated request header and a server-only 32-256 character operator token, and a bounded abort timeout. The demo membership role alone cannot authorize a paid call. Explicitly requested but unavailable lookup fails closed, and a successful provider payload must echo a phone number that normalizes to the exact requested E.164 value. CSV contact imports are permanently local-only and cannot trigger per-row paid lookups.

Production-like deployments are allowed only as demo-safe deployments today. `npm run production:gate` blocks live messaging, live billing, live provider, live AI, Twilio, and Stripe configuration unless a future controlled go-live milestone explicitly enables external impact. The go-live gate is documented in `docs/PRODUCTION_GO_LIVE.md`; the demo-safe deployment runbook is documented in `docs/PRODUCTION_DEPLOYMENT.md`.
