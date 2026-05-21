# Local Operator Runbook

This runbook covers local and demo-safe operations only. It does not authorize live SMS, live email, live notifications, live billing, real Stripe charges, real Twilio sends, provider-side credential changes, real secrets, destructive production database operations, irreversible deletion, spam, or data leakage.

The same local-only checklist is available in the app at `/settings/runbook`. That page is read-only: it displays commands and safety boundaries, but it must not execute commands, mutate records, call providers, create billing records, send notifications, expose secrets, or enable live messaging.

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

## System Status

Use `/settings/system` for a read-only local operations snapshot before demos or repair work. It displays:

- demo/live messaging/live billing flags
- selected messaging and AI providers
- production-like runtime markers
- queue backend and Redis presence
- local worker jobs-per-poll limit
- API rate-limit policy

The page is display-only. It must not mutate records, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

## Provider Numbers

Use `/settings/numbers` for read-only local number metadata review before demos or repair work. It displays:

- tenant-scoped provider phone-number metadata
- local status and provider labels
- default-number marker
- recorded capabilities

The page is display-only. It must not provision numbers, verify provider ownership, mutate metadata, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

## Usage And Analytics

Use `/settings/usage` for read-only local metering review before demos or repair work. It displays:

- tenant-scoped contact, campaign, conversation, and message counts
- local usage totals by event type
- demo billing account status and live-billing blocked state
- recent local usage events and metadata

The page is display-only. It must not mutate records, call Stripe, create billing provider artifacts, expose secrets, call providers, send notifications, or enable live messaging.

## Reporting Index

Use `/settings/reports` for read-only local report discovery before demos or reporting repair work. It displays:

- existing local reporting surfaces
- tenant-scoped analytics counts
- local usage totals
- recent readiness audit signals
- reporting safety boundaries

The page is display-only. It must not execute reports, create exports, mutate records, expose secrets, call providers, call Stripe, call live AI, send notifications, send SMS, send email, or enable live features.

## Campaign Operations

Use `/settings/campaigns` for read-only campaign and queue review before demos or worker repair work. It displays:

- campaign status counts
- recipient counts and scheduled timestamps
- queue job status counts
- local worker execution boundary

The page is display-only. It must not schedule campaigns, cancel campaigns, run workers, mutate queue rows, expose secrets, call providers, create billing records, send notifications, send SMS, or enable live messaging.

## Queue Operations

Use `/settings/queue` for read-only scheduled queue review before demos or worker repair work. It displays:

- scheduled job status counts
- due versus future queued jobs
- scheduled-campaign payload validity
- worker poll settings and queue backend metadata
- Redis presence without opening Redis connections

The page is display-only. It must not enqueue jobs, run workers, mutate queue rows, update campaign status, call Redis, expose secrets, call providers, create billing records, send notifications, send SMS, or enable live messaging.

## Contact Operations

Use `/settings/contacts` for read-only contact data review before demos or import repair work. It displays:

- contact consent status counts
- CSV import status and row totals
- tag and list counts
- recent local contact metadata

The page is display-only. It must not import contacts, create contacts, update consent, mutate tags or lists, hard-delete records, expose secrets, call providers, create billing records, send notifications, send SMS, or enable live messaging.

## Data Operations

Use `/settings/data` for read-only local data governance review before demos or retention-boundary repair work. It displays:

- tenant-scoped local record totals
- active and archived contact counts
- import ledger row totals
- retention signals and recent archived contact metadata

The page is display-only. It must not hard-delete records, restore archived contacts, run exports, mutate records, expose secrets, call providers, create billing records, send notifications, call live AI, send SMS, or enable live features.

## Audience Operations

Use `/settings/audience` for read-only audience label and saved segment review before demos or campaign repair work. It displays:

- tag counts
- list member counts
- saved segment definitions
- segment update timestamps

The page is display-only. It must not create tags, update lists, change contact memberships, evaluate segments for sends, expose secrets, call providers, create billing records, send notifications, send SMS, or enable live messaging.

## Template Operations

Use `/settings/templates` for read-only message template review before demos or campaign repair work. It displays:

- message template counts
- variable names used by templates
- campaign usage counts
- local text previews

The page is display-only. It must not create templates, edit template copy, render live outbound messages, schedule campaigns, expose secrets, call providers, create billing records, send notifications, send SMS, or enable live messaging.

## Inbox Operations

Use `/settings/inbox` for read-only shared inbox review before demos or inbox repair work. It displays:

- conversation status counts
- assignment counts
- recent local message and note counts
- local inbox safety boundary

The page is display-only. It must not create messages, assign conversations, resolve conversations, add notes, mutate contacts or consent, expose secrets, call providers, create billing records, send notifications, send SMS, or enable live messaging.

## Webhook Operations

Use `/settings/webhooks` for read-only webhook review before demos or webhook repair work. It displays:

- Twilio webhook route coverage
- local stored webhook event counts
- provider and event-type summaries
- recent webhook idempotency keys
- local webhook safety boundary

The page is display-only. It must not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, expose secrets, create billing records, send notifications, send SMS, or enable live messaging.

## Team Operations

Use `/settings/team` for read-only organization and membership review before demos or auth repair work. It displays:

- organization metadata
- membership role and status counts
- assigned conversation counts
- authored internal-note counts
- member display names and emails

The page is display-only. It must not invite users, create users, change roles, suspend members, delete memberships, call Clerk, send email, expose secrets, call providers, create billing records, send notifications, send SMS, or enable live messaging.

## Billing Operations

Use `/settings/billing` for read-only local billing boundary review before demos or metering repair work. It displays:

- local billing account status
- live billing gate status
- Stripe placeholder presence
- usage-event totals
- recent usage-event metadata

The page is display-only. It must not call Stripe, create subscriptions, create invoices, collect payment methods, charge cards, send email, expose secrets, call providers, create external billing artifacts, send notifications, send SMS, or enable live billing.

## AI Operations

Use `/settings/ai` for read-only fake AI boundary review before demos or AI repair work. It displays:

- selected AI provider state
- fake-provider readiness
- deterministic AI endpoint coverage
- local AI usage totals
- recent AI usage-event metadata

The page is display-only. It must not submit prompts, call live AI, create paid model requests, mutate conversations, expose API keys, create billing artifacts, call providers, send notifications, send SMS, or enable live AI.

## API Operations

Use `/settings/api` for read-only API surface review before demos or route-contract repair work. It displays:

- static local API route inventory
- route area and read/write classification
- external-impact classification
- route-level safety notes
- API rate-limit policy and middleware matcher

The page is display-only. It must not execute API handlers, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, disable rate limits, or enable live messaging, live billing, or live AI.

## Security Operations

Use `/settings/security` for read-only safety and security control review before demos or production-boundary repair work. It displays:

- demo-safe gate status
- external-impact boundary status
- API rate-limit policy
- production override state
- documented secret-storage boundaries
- validation-command references

The page is display-only. It must not scan files, read or expose raw environment values, reveal `.env.local`, reveal provider tokens or API keys, create or mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, disable rate limits, or enable live messaging, live billing, or live AI.

## Notification Operations

Use `/settings/notifications` for read-only notification no-send boundary review before demos or production-boundary repair work. It displays:

- email, in-app, SMS alert, and webhook notification boundaries
- runtime live messaging and live billing gate status
- provider and production override status
- future notification-provider gate requirements

The page is display-only. It must not create recipients, subscriptions, templates, jobs, sends, alerts, or webhooks; call providers, call Stripe, call live AI, send SMS, send email, send notifications, mutate records, expose secrets, or enable live features.

## Contract Operations

Use `/settings/contracts` for read-only contract and drift-control review before demos or route-contract repair work. It displays:

- contract file inventory
- validation command references
- drift-control expectations
- safety-boundary text

The page is display-only. It must not read contract file contents, execute validation commands, scan files, mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, or enable live features.

## Validation Operations

Use `/settings/validation` for read-only local gate review before demos or validation repair work. It displays:

- validation command inventory
- gate areas and safety boundaries
- repair-loop signals
- validation safety-boundary text

The page is display-only. It must not execute commands, inspect logs or test reports, scan files, read `.env.local`, mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, or enable live features.

## Compliance Detail

Use `/settings/compliance` for read-only compliance profile review before demos or repair work. It displays:

- profile field completeness
- demo A2P metadata status
- live-message hard-gate blockers
- recent local compliance readiness audit events and CSV export link

The page is display-only. It must not mutate compliance records, verify provider registration, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

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
