# Next Prompts

## Current State

Completed through Milestone 10 hardening:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.
- Milestone 5: shared inbox conversation/message APIs, assignment, notes, resolve/reopen, demo inbound creation, and STOP/HELP local parsing.
- Milestone 6: compliance profile/checklist API and centralized messaging hard gates.
- Milestone 7: deterministic fake AI copy, reply suggestion, summary, and lead qualification APIs.
- Milestone 8: local usage/billing records, analytics overview, and billing usage APIs.
- Milestone 9: `/demo` investor console and deterministic Playwright demo path.
- Milestone 10: contract drift gate for API docs, tenant `orgId` invariant check, named seeded demo E2E script, and testing/local-gate doc updates.
- Post-MVP webhook foundation: Twilio inbound/status route foundations, signature validation helper, raw webhook event persistence, and webhook unit tests.
- Post-MVP provider settings foundation: read-only provider readiness endpoint, secret-safe Twilio credential presence reporting, and provider settings unit tests.
- Post-MVP local worker foundation: `npm run worker` processes due scheduled campaigns through the dummy provider only, creates idempotent outbound message rows, and completes queue jobs/campaigns.
- Post-MVP continuous worker foundation: `npm run worker:watch` polls locally with bounded-loop controls, while `npm run worker` remains one-shot and all worker passes stay dummy-provider/live-disabled only.
- Runtime default repair: Next routes, seed scripts, and workers now share demo-safe runtime defaults, including the local development `DATABASE_URL`, before Prisma client initialization.
- Post-MVP status transition foundation: Twilio status webhooks update matching local `Message` delivery metadata after idempotent raw webhook storage, without provider calls or outbound side effects.
- Post-MVP provider number foundation: local `ProviderPhoneNumber` metadata, `GET/POST /api/settings/numbers`, seeded demo number, and demo console number visibility without provider provisioning or live sends.
- Post-MVP live-readiness audit foundation: local `LiveReadinessAuditEvent` records for compliance profile and provider number metadata changes plus `GET /api/settings/readiness-audit`.
- Post-MVP local worker rate limit foundation: `WORKER_MAX_JOBS_PER_POLL` clamps due scheduled campaign jobs processed per poll while preserving dummy-only/live-disabled execution.
- Post-MVP BullMQ/Redis enqueue foundation: optional `QUEUE_BACKEND=bullmq` scheduling mirror with `REDIS_URL`, deterministic BullMQ scheduled-campaign job construction, and database-default validation that does not require Redis.
- Post-MVP BullMQ worker consumption foundation: `npm run worker:bullmq` starts only when BullMQ/Redis and dummy-only live-disabled gates are configured, consumes BullMQ jobs by durable `queueJobId`, and shares the database worker's idempotent dummy send path.
- Post-MVP BullMQ/Redis smoke foundation: `npm run queue:bullmq:smoke` skips unless BullMQ/Redis are explicitly configured and otherwise writes/removes one dedicated smoke-queue job without touching campaigns, providers, billing, or live flags.
- Post-MVP readiness UI foundation: `/settings` renders go-live readiness status from existing compliance, provider, numbers, readiness audit, and queue backend metadata; the investor demo E2E now checks the page.
- Post-MVP production deployment gate foundation: `npm run production:gate` is part of validation and blocks production-like environments from live messaging, live billing, live provider, live AI, Twilio, or Stripe settings without an explicit future override.
- Post-MVP production go-live gate design: `docs/PRODUCTION_GO_LIVE.md` documents the current production-like demo deployment gate and future controls required before live SMS/billing/provider/AI enablement.
- Post-MVP API rate limiting foundation: Next middleware protects `/api/*` with local in-memory fixed-window limits, demo-safe env defaults, `429` retry headers, deterministic unit coverage, and `/settings` visibility.
- Post-MVP provider credential metadata foundation: `ProviderCredential`, `PATCH /api/settings/provider`, redacted Twilio readiness metadata, readiness audit events, demo seed coverage, and tests without raw secret persistence or provider calls.
- Post-MVP provider credential deletion foundation: `DELETE /api/settings/provider` clears local Twilio readiness metadata and records an audit event without Twilio calls, live-send enablement, or provider-side revocation.
- Post-MVP provider credential rotation history: `ProviderCredentialRotation`, `GET /api/settings/provider/rotations`, local history writes for configure/refresh/rotate/delete, seeded redacted demo history, and `/settings` visibility without raw token or fingerprint exposure.
- Post-MVP provider settings detail UI: `/settings/provider` renders read-only Twilio metadata, live blockers, and credential rotation history using existing redacted local metadata.
- Post-MVP provider credential metadata UI/forms: `/settings/provider` can save and clear local Twilio credential readiness metadata through existing safe APIs, refreshes redacted readiness/rotation history, and the seeded investor demo E2E covers the flow without provider calls or live sends.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Post-MVP Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Continue from the post-MVP backlog after Milestone 10 hardening.

READ FIRST:
1. AGENTS.md
2. PLAN.md
3. docs/CANONICAL_IMPLEMENTATION_PLAN.md
4. contracts/**
5. docs/**
6. SUMMARY*.md
7. BLOCKERS*.md
8. docs/LOCAL_GATE.md

SCOPE:
- Preserve all Milestone 0-10 gates and demo-safe defaults.
- Implement the next post-MVP slice only when contracts/docs are updated first.
- Good candidate slices: deployment documentation, production operations runbooks, provider credential rotation-history filtering, or safe metadata form refinements.
- Keep live SMS, live billing, real notifications, live AI, and real provider calls blocked unless explicit future hard gates are implemented and tested.
- Run the full local gate and seeded demo path before committing.

DO NOT:
- Send live SMS, email, notifications, or billing events.
- Call live AI or provider APIs.
- Add real secrets or production-destructive operations.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and `npm run test:e2e:demo` as appropriate. Repair failures before committing.
```
