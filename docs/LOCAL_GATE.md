# Local Gate

Run:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run demo:seed
npm run validate
```

If Playwright browsers are missing:

```bash
npx playwright install chromium
npm run test:e2e:smoke
```

Milestone 9 demo path check:

```bash
npm run test:e2e:demo
```

Optional local worker checks:

```bash
npm run worker
WORKER_MAX_ITERATIONS=1 WORKER_POLL_INTERVAL_MS=1000 npm run worker:watch
QUEUE_BACKEND=bullmq REDIS_URL=redis://localhost:6379 npm run worker
QUEUE_BACKEND=bullmq REDIS_URL=redis://localhost:6379 npm run worker:bullmq
```

BullMQ/Redis enqueue support is optional. The default local gate does not require Redis, and campaign scheduling must continue to persist database `QueueJob` rows when BullMQ is disabled or not configured.

Milestone 10 contract hardening is included in `npm run validate`. The contract gate now verifies that implemented API route/method pairs are documented in both `contracts/CONTRACT-API.md` and `docs/API_MAP.md`, and that tenant-scoped Prisma models retain an `orgId` field.

Post-MVP production deployment gates are included in `npm run validate`. Production-like environments (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV` set to production/prod) are blocked from live messaging, live billing, live provider, live AI, Twilio, or Stripe settings unless a future controlled deployment explicitly sets `ALLOW_PRODUCTION_EXTERNALS=true`.

The local gate must pass before committing a milestone unless an exact environment blocker is recorded in `BLOCKERS.codex.md`.
