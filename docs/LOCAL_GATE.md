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
QUEUE_BACKEND=bullmq REDIS_URL=redis://localhost:6379 npm run queue:bullmq:smoke
```

Production observability planning check:

```bash
npm run observability:check
```

The observability check is included in `npm run validate` and verifies that the production observability plan remains present and demo-safe.

Local operator runbook check:

```bash
npm run operator:check
```

The operator runbook check is included in `npm run validate` and verifies that `docs/LOCAL_OPERATOR_RUNBOOK.md` keeps the local repair loop, worker commands, admin exports, and demo-safe external-impact boundary documented.

Deployment platform notes check:

```bash
npm run platform:check
```

The platform notes check is included in `npm run validate` and verifies that `docs/DEPLOYMENT_PLATFORM_NOTES.md` keeps demo-safe hosting defaults, production gate usage, smoke routes, worker limits, and no-external-impact platform boundaries documented.

Context budget check:

```bash
npm run context:check
```

The context budget check is included in `npm run validate` and verifies that current handoff files stay compact. Run history lives in `git log`. Large test files are allowed, but agents should inspect them with targeted `rg` searches instead of loading them wholesale.

Agent startup brief:

```bash
npm run agent:brief
```

The agent brief is intentionally not part of `npm run validate`; it is a compact startup aid for autonomous loops so agents can inspect current git state, current handoffs, latest run headings, and large-file advisories before deciding which files need targeted reads.

BullMQ/Redis enqueue support is optional. The default local gate does not require Redis, and campaign scheduling must continue to persist database `QueueJob` rows when BullMQ is disabled or not configured.

The BullMQ smoke command skips successfully unless BullMQ and Redis are explicitly configured. When enabled, it uses a dedicated smoke queue and does not touch scheduled campaigns, providers, billing, or live messaging flags.

Milestone 10 contract hardening is included in `npm run validate`. The contract gate now verifies that implemented API route/method pairs are documented in both `contracts/CONTRACT-API.md` and `docs/API_MAP.md`, and that tenant-scoped Prisma models retain an `orgId` field.

Post-MVP production deployment gates are included in `npm run validate`. Production-like environments (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV` set to production/prod) are blocked from live messaging, live billing, live provider, live AI, Twilio, or Stripe settings unless a future controlled deployment explicitly sets `ALLOW_PRODUCTION_EXTERNALS=true`.

Production go-live design is documented in `docs/PRODUCTION_GO_LIVE.md`. That document is a planning gate only; it does not authorize live SMS, billing, AI, provider calls, secrets, or external notifications.

Production auth/RBAC planning check:

```bash
npm run production-auth:check
```

The production auth/RBAC check is included in `npm run validate` and verifies that `docs/PRODUCTION_AUTH_RBAC.md`, the executable API RBAC matrix, the production deployment runbook, and the production gate keep Clerk-backed auth disabled for demo-safe production-like deployments until explicit auth controls exist.

Production worker policy validation is included in `npm run validate`. It verifies that the local/demo-only worker boundary remains documented, source-enforced, and covered by tests before any future live worker design proceeds.

Production-like demo deployment operations are documented in `docs/PRODUCTION_DEPLOYMENT.md`. That runbook requires demo-safe defaults and treats provider credential metadata as local readiness data only.

Demo-safe hosting platform notes are documented in `docs/DEPLOYMENT_PLATFORM_NOTES.md`. They do not authorize live messaging, billing, AI, provider calls, notifications, third-party telemetry exports, real secrets, or destructive data operations.

The local gate must pass before committing a milestone unless an exact environment blocker is recorded in `BLOCKERS.codex.md`.

GitHub `ci` and `premerge` workflows invoke `pwsh ./scripts/local-gate.ps1` after install/browser setup, so automated green status also includes the protected gate integrity check before `npm run validate`.
