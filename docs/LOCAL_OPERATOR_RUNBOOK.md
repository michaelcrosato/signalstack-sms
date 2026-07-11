# Local Operator Runbook

This runbook covers local and demo-safe operations only. It does not authorize live SMS, live email, live notifications, live billing, real Stripe charges, real Twilio sends, provider-side credential changes, real secrets, destructive production database operations, irreversible deletion, spam, or data leakage.

The same local-only checklist is available at `/settings/runbook`. That page is read-only: it displays commands and safety boundaries, but it must not execute commands, mutate records, call providers, create billing records, send notifications, expose secrets, or enable live messaging.

## Required Defaults

```bash
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

## Human-Gated Live-Test SMS

This runbook does not authorize a live send. If a human explicitly approves the isolated `/demo` exception, its environment must include a randomly generated, server-only `LIVE_TEST_SMS_OPERATOR_TOKEN` between 32 and 256 characters and a bounded `LIVE_TEST_SMS_TIMEOUT_MS` (default `5000`, clamped to `1000..10000`). Keep the token out of source control, screenshots, logs, support artifacts, browser configuration, and provider/readiness metadata.

The operator enters the complete allowlisted recipient, the confirmation phrase, and the operator token for each POST. The page never prefills or renders those operator controls and clears them from component state after a response. Readiness shows only recipient counts and last-four hints, never complete allowlist or from-number values. Re-enter the controls when retrying a request that returned `202`; the unchanged UUID plus actor/recipient/body binding retrieves the pending reservation without a second provider call. Use a new UUID only after a definitive failure and an intentional human decision to attempt a new send.

## Human-Gated Paid Phone Lookup

Local contact normalization and every CSV import remain free and provider-independent. If a human separately authorizes paid Twilio Lookup for a single-contact create, configure a random server-only `LIVE_LOOKUP_OPERATOR_TOKEN` between 32 and 256 characters and supply that exact secret only in the `x-signalstack-lookup-token` request header. The deterministic demo membership role does not authorize the paid request. Keep this token out of source control, URLs, browser-delivered configuration, screenshots, logs, and support artifacts; the server neither persists nor forwards it to Twilio.

## Daily Local Start

```bash
npm install
npm run db:generate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run demo:seed
npm run validate
```

## Autonomous Codex Loop

```powershell
.\codex-skynet-max.ps1 -FullYolo -KeepAwake
```

The loop is endless by default. Use `-FuseMinutes <minutes>` only for a capped run. Failed commands or protected gates are not green handoffs.

For a strict one-shot launch check:

```powershell
.\codex-skynet-max.ps1 -PreflightOnly
```

Run the seeded investor path after changes to pages, APIs, seed data, provider metadata, exports, campaigns, inbox, AI, analytics, billing, or middleware:

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

Optional BullMQ/Redis checks remain local and must not bypass the durable database job record:

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

## Canonical Settings Model

The implemented settings child-page allowlist is exactly:

- `/settings/operations`
- `/settings/health`
- `/settings/security`
- `/settings/validation`
- `/settings/queue`
- `/settings/provider`
- `/settings/compliance`
- `/settings/readiness-audit`
- `/settings/exports`
- `/settings/runbook`

`/settings` is the consolidated go-live readiness view. Runtime, environment, number, campaign, contact, data, audience, template, inbox, webhook, delivery, team, billing, reporting, AI, notification, integration, workflow, release, and blocker summaries live there instead of on separate per-area settings pages.

Legacy per-area settings paths are not routes. Interactive product work belongs under `/dashboard/contacts`, `/dashboard/campaigns`, `/dashboard/inbox`, `/dashboard/templates`, `/dashboard/analytics`, and `/dashboard/compliance`; the seeded demo checkpoint is `/demo`.

The shared operator-surface inventory drives the root launch view, demo console, settings directory, operations index, and runbook links. Unit coverage pins the allowlist and rejects static links to non-allowlisted settings pages.

## Focused Operator Views

- Use `/settings/operations` to navigate the surviving operator surfaces.
- Use `/settings/health` to review the health contract, demo-safe defaults, and runtime blockers. Rendering it does not execute a probe.
- Use `/settings/queue` to review due/future jobs, payload validity, worker settings, and queue-backend metadata. Rendering it does not enqueue jobs, run workers, call Redis, or call providers.
- Use `/settings/provider` to manage local redacted credential metadata and bounded rotation-history exports. It does not verify or revoke provider-side credentials or enable live messaging.
- Use `/settings/security` to review demo-safe gates, rate-limit policy, production overrides, and secret-storage boundaries. It does not scan files or expose environment values.
- Use `/settings/readiness-audit` to review tenant-scoped readiness events and bounded exports. It does not mutate or replay events.

All operator views are demo-safe and display-focused. They must not mutate records, call providers, create billing records, send notifications, or enable live messaging.

## Validation Operations

Use `/settings/validation` for read-only local gate review before demos or repair work. It displays the validation inventory, gate boundaries, repair signals, and no-impact states. It must not execute commands, inspect logs or test reports, scan files, read `.env.local`, mutate records, call providers, call live AI, call Stripe, send SMS, email, or notifications, expose secrets, or enable live features.

## Compliance Detail

Use `/settings/compliance` for read-only compliance profile review. It displays profile completeness, demo A2P metadata status, live-message hard-gate blockers, recent local readiness events, and the CSV export link. It must not mutate compliance records, verify provider registration, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

## Repair Loop

When validation fails:

1. Diagnose the smallest failing command.
2. Repair the local code, docs, contracts, or tests.
3. Rerun the smallest failing command.
4. Rerun `npm run validate`.
5. Rerun `npm run test:e2e:demo` when the change touches the seeded demo path.

If a local dependency blocks progress, record the exact command, error, suspected cause, and next repair step in `BLOCKERS.codex.md`.

## Production Boundary

Production-like demo deployment is covered by `docs/PRODUCTION_DEPLOYMENT.md`. Future live SMS, live billing, live AI, live provider verification, real notifications, production auth/RLS, or provider-side credential operations require separate human-approved go-live gates and are outside this local runbook.
