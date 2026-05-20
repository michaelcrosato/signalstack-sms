# Local Operator Runbook

This runbook covers local and demo-safe operations only. It does not authorize live SMS, live email, live notifications, live billing, real Stripe charges, real Twilio sends, provider-side credential changes, real secrets, destructive production database operations, irreversible deletion, spam, or data leakage.

## Required Defaults

Use these defaults for local operation:

```bash
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

## Daily Local Start

```bash
npm install
npm run db:generate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run demo:seed
npm run validate
```

Run the seeded investor path after changes that touch pages, APIs, seed data, provider metadata, exports, campaigns, inbox, AI, analytics, billing, or middleware:

```bash
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run test:e2e:demo
```

## Local Workers

Run the database-backed dummy worker only with live messaging disabled:

```bash
$env:LIVE_MESSAGING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
npm run worker
```

For bounded polling:

```bash
$env:WORKER_MAX_ITERATIONS='1'
$env:WORKER_POLL_INTERVAL_MS='1000'
$env:LIVE_MESSAGING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
npm run worker:watch
```

Optional BullMQ/Redis checks remain local and must not be used to bypass the durable database job record:

```bash
$env:QUEUE_BACKEND='bullmq'
$env:REDIS_URL='redis://localhost:6379'
$env:LIVE_MESSAGING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
npm run queue:bullmq:smoke
```

## Admin Exports

Use `/settings/exports` for read-only local CSV exports:

- Readiness audit events: `/api/settings/readiness-audit/export`
- Redacted provider credential rotation history: `/api/settings/provider/rotations/export`

Exports are tenant-scoped local metadata only. They must not expose raw auth tokens, provider token fingerprints, customer secrets, provider verification results, full message bodies, live billing identifiers, or provider-side state. Export routes must not mutate records, call providers, create billing records, send notifications, or enable live messaging.

## Repair Loop

When validation fails:

1. Diagnose the smallest failing command.
2. Repair the local code, docs, contracts, or tests.
3. Rerun the smallest failing command.
4. Rerun `npm run validate`.
5. Rerun `npm run test:e2e:demo` when the change touches the seeded demo path.

If a local environment dependency blocks progress, record the exact command, exact error, suspected cause, and next repair step in `BLOCKERS.codex.md`.

## Production Boundary

Production-like demo deployment is covered by `docs/PRODUCTION_DEPLOYMENT.md`. Future live SMS, live billing, live AI, live provider verification, real notifications, or provider-side credential operations require a separate go-live gate and are outside this local runbook.
