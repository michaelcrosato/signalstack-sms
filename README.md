# SignalStack SMS

A demo-safe, multi-tenant SMS marketing + shared-inbox + lead-qualification SaaS skeleton, built on
Next.js (App Router) · TypeScript · Prisma/PostgreSQL · Redis/BullMQ. **Every real-world side effect —
live SMS, billing, AI, production auth, production workers, deploy — is off by default behind
executable hard gates.** Out of the box it runs entirely against a dummy SMS provider and a
deterministic "fake" AI provider.

> Status is honest, not aspirational. Read [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md)
> before trusting any "production-ready" framing. Short version: this is a competent **demo skeleton**,
> not a shippable SMS product. See **Honest status** below.

## What SignalStack does

- **Contacts** — CRUD, CSV import with validation/dedup, tags, lists, segments, merge/archive.
- **Campaigns** — draft → preflight (consent/opt-out/archive recheck) → schedule → cancel. Scheduled
  campaigns become durable `QueueJob` rows drained by a worker that "sends" via the dummy provider.
- **Shared inbox** — conversations, replies, internal notes, assignment, resolve. Inbound STOP/START
  keyword handling flips contact consent state.
- **Compliance** — opt-out keyword classification, consent-evidence model, double-opt-in toggle,
  timezone-aware quiet-hours logic, A2P/profile readiness gate.
- **AI (fake by default)** — reply suggestions, lead qualification scoring, conversation summary,
  campaign copy. A real Anthropic Claude integration exists but is gated off.
- **Billing (local counters)** — usage events per org; no Stripe/invoicing.
- **Operations surfaces** — ~10 read-only `/settings` views: readiness audit, queue, security,
  health, validation, provider credentials (redacted), phone numbers, runbook, exports.
- **Live-test SMS** — `/demo` console: a single heavily-gated real Twilio send for investor demos.

## Architecture

- **Web** — Next.js App Router. `/api/*` route handlers validate input with zod, enforce roles via
  `requireApiRole`, then call a repository layer (`src/lib/db/repositories/*`).
- **Provider adapter** — `getMessagingProvider(name)` returns `dummyProvider` (default) or a real
  `twilioProvider` (HTTP to the Twilio REST API, gated off). See
  [`contracts/CONTRACT-PROVIDER-ADAPTER.md`](contracts/CONTRACT-PROVIDER-ADAPTER.md).
- **Queue** — campaigns write durable `QueueJob` rows. Two interchangeable consumers exist: a
  **DB-polling worker** (`workers/index.ts`, the default) and a **BullMQ worker** (`workers/bullmq.ts`,
  enabled by `QUEUE_BACKEND=bullmq` + `REDIS_URL`). Both delegate into `src/lib/queue/worker.ts`.
  Nothing runs a worker in-process — you must start one manually.
- **DB** — PostgreSQL via Prisma. All tenant tables carry `orgId`. A Postgres RLS migration exists but
  is **off by default** (see review); isolation today is app-level `WHERE orgId`.
- **Webhooks** — `/api/webhooks/twilio/{inbound,status}` verify the `X-Twilio-Signature` HMAC-SHA1
  (constant-time) and dedupe via idempotency keys.

A fuller diagram and the seam-level problems are in [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md#architecture).

## Stack

Next.js 15 · React 19 · TypeScript · Prisma 6 (`@prisma/client`) · PostgreSQL 16 · Redis 7 +
BullMQ 5 (ioredis) · zod · Tailwind 3 · Biome (lint/format) · Vitest (unit) · Playwright (e2e).

## Run / dev

Prerequisites: Node 24 (CI pins 24; Node 20/24 differ on test arg handling), Docker, npm.

```bash
# 1. backing services (Postgres :5432, Redis :6379)
docker compose up -d postgres redis

# 2. install + generate the Prisma client
npm ci
npm run db:generate

# 3. create your env file (demo-safe defaults; keep real secrets out of git)
cp .env.example .env
#    defaults: DEMO_MODE=true, MESSAGING_PROVIDER=dummy, AI_PROVIDER=fake, all LIVE_* off

# 4. apply the schema and seed synthetic demo data
npx prisma migrate deploy          # or: npx prisma migrate dev
npx tsx prisma/seed.ts             # synthetic demo org + contacts (NEVER real customer data)

# 5. run the app
npm run dev                        # http://localhost:3000  (dashboard at /dashboard)

# 6. (separately) run a worker so scheduled campaigns actually drain
npm run worker                     # DB-polling worker (dummy sends)
#    or, with Redis + QUEUE_BACKEND=bullmq set:
npm run worker:bullmq
```

### Tests

```bash
npm run test            # vitest unit tests
                        # NOTE: a few tests currently require a live Postgres at localhost:5432
                        #       (see review §Tests — npm test is not yet hermetic).
npm run typecheck       # tsc --noEmit
npm run lint            # biome lint

# e2e (Playwright auto-starts `next dev`; install the browser first)
npx playwright install chromium
npm run test:e2e:smoke
npm run test:e2e:demo
```

### The gate

```bash
bash scripts/verify.sh          # the engine gate: typecheck + lint + test + state + shield
bash scripts/verify.sh --e2e    # also runs e2e
```

> The repo also ships ~12 product-specific check scripts (`npm run contracts:check`,
> `compliance:check`, `production:gate`, `secrets:scan`, `ai:check`, …, and the umbrella
> `npm run validate`). **These are currently NOT invoked by `verify.sh` or CI** — they were de-wired
> when the operations-engine template was reinstalled. Re-wiring them is the top roadmap item. Until
> then, run `npm run validate` by hand. See the review and roadmap.

## Honest status

- **Works in demo mode:** contacts/CSV, segments, templates, campaign preflight/schedule, DB worker
  (dummy sends), shared inbox + STOP/START, fake AI, local usage counters, read-only ops surfaces.
- **Not production-ready.** Key gaps (all detailed with `file:line` in the review):
  - The product's custom quality checks are **de-wired** from the gate and CI.
  - Live send paths **bypass the central compliance gate** (opt-out/consent/quiet-hours not enforced).
  - Inbound webhooks have **no multi-tenant routing** (everything lands in the demo org; 500 under prod auth).
  - **Postgres RLS is present but disabled**; tenant isolation is app-level only.
  - Production Clerk auth exists but **does not validate JWT issuer/audience** (auth-bypass class).
  - This README's previous version documented commands that don't exist — the commands above are real.
- **Dormant but real:** Twilio adapter, Claude AI (`claude-haiku-4-5-20251001`), BullMQ — all gated off.

## Pointers

- **Engineering review (read this):** [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md)
- **Roadmap:** [`roadmap/ROADMAP.md`](roadmap/ROADMAP.md)
- **Contracts (intended behavior):** [`contracts/CONTRACT-*.md`](contracts/)
- **Domain docs:** [`docs/`](docs/) — `COMPLIANCE.md`, `WEBHOOKS.md`, `PROVIDER_ADAPTER.md`, `DATA_MODEL.md`, `ARCHITECTURE.md`.
- **Agent operating instructions:** [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md).

_This product is 100% AI-coded; the human operator plans (in `roadmap/ROADMAP.md`) and does final QA._
