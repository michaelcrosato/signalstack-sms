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
- Post-MVP provider metadata form refinement: `/settings/provider` now requires explicit local-only confirmation before clearing metadata and includes browser-side account/phone format hints without provider verification, provider revocation, live sends, billing, notifications, or secret exposure.
- Post-MVP production deployment runbook: `docs/PRODUCTION_DEPLOYMENT.md` documents demo-safe production-like deployment env, pre-deploy checks, database deployment discipline, post-deploy smoke checks, rollback, and incident switches without enabling live external impact.
- Post-MVP provider credential rotation-history filtering: `GET /api/settings/provider/rotations` accepts allowlisted `action` and bounded `limit` query parameters; `/settings/provider` exposes action filter links and the investor demo E2E covers the deleted-history filter without exposing secrets or provider calls.
- Post-MVP readiness audit export: `GET /api/settings/readiness-audit` supports bounded `limit`, `action`, and `subjectType` filters; `GET /api/settings/readiness-audit/export` returns a tenant-scoped CSV export; `/settings` exposes action filters and an export link without provider calls, billing records, notifications, live messaging, or mutations.
- Post-MVP production observability planning: `docs/PRODUCTION_OBSERVABILITY.md` documents demo-safe platform/local observability signals, logging exclusions, and future vendor gates; `npm run observability:check` is part of validation and verifies the no-external-impact planning boundary.
- Post-MVP provider credential rotation export: `GET /api/settings/provider/rotations/export` returns a tenant-scoped CSV export of redacted local credential rotation metadata using the same allowlisted filters as the JSON route; `/settings/provider` exposes the export link and the investor demo E2E covers it without raw tokens, provider calls, billing records, notifications, live messaging, or mutations.
- Post-MVP admin exports view: `/settings/exports` consolidates local CSV export links for readiness audit events and redacted provider credential rotation history with a visible safety boundary; the investor demo E2E covers it without adding mutations, provider calls, billing records, notifications, live messaging, or raw secret exposure.
- Post-MVP local operator runbook: `docs/LOCAL_OPERATOR_RUNBOOK.md` documents local startup, validation, worker, admin export, repair-loop, and production-boundary procedures; `npm run operator:check` is included in validation to keep the runbook present and demo-safe.
- Post-MVP local system status view: `/settings/system` renders a read-only operations snapshot of demo/live flags, runtime markers, queue backend metadata, worker poll limits, and API rate-limit policy; unit tests and the investor demo E2E cover it without mutations, provider calls, billing records, notifications, live messaging, or secrets.
- Post-MVP deployment platform notes: `docs/DEPLOYMENT_PLATFORM_NOTES.md` documents demo-safe production-like hosting defaults, build/release commands, smoke routes, worker boundaries, forbidden live-impact env values, and future platform gates; `npm run platform:check` is included in validation.
- Post-MVP local usage and analytics view: `/settings/usage` renders read-only tenant-scoped metrics, local usage totals, billing boundary status, and recent usage events; the investor demo E2E covers it without Stripe calls, billing provider artifacts, notifications, provider calls, live messaging, mutations, or secrets.
- Post-MVP local launch dashboard: `/` now renders a static local command center with demo-safe defaults and links to the seeded demo, go-live readiness, provider details, system status, usage, and admin exports without database access, mutations, provider calls, billing artifacts, notifications, live messaging, or secrets.
- Post-MVP local operator runbook app view: `/settings/runbook` renders demo-safe validation, seed, worker, BullMQ smoke, admin-view, and repair-loop commands as read-only text; root/settings/demo navigation and E2E coverage include it without executing commands, mutating records, provider calls, billing records, notifications, live messaging, or secrets.
- Post-MVP local compliance detail view: `/settings/compliance` renders existing compliance profile completeness, A2P metadata status, live-message hard-gate blockers, and compliance readiness audit export links as read-only local metadata; root/settings/demo/runbook navigation and E2E coverage include it without mutating records, provider verification, notifications, billing records, live messaging, or secrets.
- Post-MVP local provider numbers view: `/settings/numbers` renders existing tenant-scoped provider phone-number metadata, default-number state, capabilities, and safety boundaries as read-only local metadata; root/settings/demo/provider navigation and E2E coverage include it without provisioning numbers, provider verification, mutations, notifications, billing records, live messaging, or secrets.
- Post-MVP local campaign operations view: `/settings/campaigns` renders existing campaign status counts, recipient counts, scheduled campaign metadata, queue job status, idempotency keys, and worker safety boundaries as read-only local metadata; root/settings/demo/runbook/usage navigation and E2E coverage include it without scheduling campaigns, running workers, mutating queue rows, provider calls, billing records, notifications, live messaging, or secrets.
- Post-MVP local contact operations view: `/settings/contacts` renders existing contact consent counts, CSV import status, row totals, tag counts, list counts, and recent contact/import metadata as read-only local metadata; root/settings/demo/runbook/usage/campaign/inbox navigation and E2E coverage include it without importing contacts, updating consent, mutating labels, provider calls, billing records, notifications, live messaging, or secrets.
- Post-MVP local audience operations view: `/settings/audience` renders existing tag counts, list member counts, saved segment definitions, segment update timestamps, and safety boundaries as read-only local metadata; root/settings/demo/runbook/usage/campaign/contact/template/inbox navigation and E2E coverage include it without changing memberships, evaluating segments for sends, provider calls, billing records, notifications, live messaging, mutations, or secrets.
- Post-MVP local template operations view: `/settings/templates` renders existing message template counts, variable names, campaign usage, text previews, and safety boundaries as read-only local metadata; root/settings/demo/runbook/usage/campaign/contact/inbox navigation and E2E coverage include it without creating templates, editing copy, rendering live outbound messages, scheduling campaigns, provider calls, billing records, notifications, live messaging, or secrets.
- Post-MVP local inbox operations view: `/settings/inbox` renders existing conversation status counts, assignment counts, recent message/note counts, contact/assignee display metadata, and inbox safety boundaries as read-only local metadata; root/settings/demo/runbook/usage navigation and E2E coverage include it without creating messages, assigning conversations, resolving threads, mutating contacts, provider calls, billing records, notifications, live messaging, or secrets.
- Post-MVP local webhook operations view: `/settings/webhooks` renders existing Twilio webhook route coverage, stored webhook counts, provider/event-type summaries, recent idempotency keys, and webhook safety boundaries as read-only local metadata; root/settings/demo/runbook/inbox navigation and E2E coverage include it without replaying payloads, creating webhook events, mutating messages or contacts, provider calls, billing records, automatic replies, notifications, live messaging, or secrets.
- Post-MVP local delivery operations view: `/settings/delivery` renders existing tenant-scoped message direction counts, delivery status metadata, provider status labels, provider message ID presence, campaign/conversation context, recent idempotency keys, and delivery safety boundaries as read-only local metadata; root/settings/demo/campaign/inbox/webhook navigation and E2E coverage include it without sending SMS, retrying deliveries, replaying webhooks, mutating messages, provider calls, billing records, notifications, live messaging, or secrets.
- Post-MVP local team operations view: `/settings/team` renders existing organization metadata, membership role/status counts, assigned conversation counts, authored internal-note counts, member names/emails, and team safety boundaries as read-only local metadata; root/settings/demo/runbook/inbox navigation and E2E coverage include it without inviting users, changing roles, suspending members, deleting memberships, calling Clerk, sending email or notifications, provider calls, billing records, live messaging, mutations, or secrets.
- Post-MVP local billing operations view: `/settings/billing` renders existing local billing account status, live billing gate status, Stripe placeholder presence, usage-event totals, recent usage metadata, and billing safety boundaries as read-only local metadata; root/settings/demo/runbook/usage navigation and E2E coverage include it without Stripe calls, subscriptions, invoices, payment collection, card charges, email, notifications, provider calls, SMS, live billing, mutations, or secrets.
- Post-MVP local AI operations view: `/settings/ai` renders existing selected AI provider state, fake-provider readiness, deterministic AI endpoint coverage, local AI usage totals, recent AI usage metadata, and AI safety boundaries as read-only local metadata; root/settings/demo/runbook/usage/billing navigation and E2E coverage include it without prompt submission, live AI calls, paid model requests, conversation mutation, billing artifacts, notifications, provider calls, SMS, live AI enablement, mutations, or secrets.
- Post-MVP local API operations view: `/settings/api` renders static local API route inventory, route areas, read/write classification, external-impact classification, route safety notes, and API rate-limit policy as read-only local metadata; root/settings/demo/system navigation and E2E coverage include it without executing handlers, mutating records, provider calls, Stripe calls, live AI, SMS, email, notifications, secrets, or live feature enablement.
- Post-MVP local contract operations view: `/settings/contracts` renders static local contract inventory, drift controls, validation command references, and safety-boundary text as read-only local metadata; root/settings/demo/api/security/runbook navigation and E2E coverage include it without reading contract file contents, executing checks, scanning files, mutating records, provider calls, Stripe calls, live AI, SMS, email, notifications, secrets, or live feature enablement.
- Post-MVP local validation operations view: `/settings/validation` renders static local gate inventory, repair signals, and validation safety-boundary text as read-only local metadata; root/settings/demo/contracts/security/runbook navigation and E2E coverage include it without executing commands, inspecting logs, scanning files, mutating records, provider calls, Stripe calls, live AI, SMS, email, notifications, secrets, or live feature enablement.
- Post-MVP local security operations view: `/settings/security` renders demo-safe gate status, external-impact boundary status, API rate-limit policy, production override state, documented secret-storage boundaries, and validation-command references as read-only local metadata; root/settings/demo/system/api navigation and E2E coverage include it without scanning files, exposing raw env values or secrets, mutating records, provider calls, Stripe calls, live AI, SMS, email, notifications, or live feature enablement.
- Post-MVP local data operations view: `/settings/data` renders tenant-scoped local record totals, active/archived contact counts, import ledger totals, retention signals, recent archived contact metadata, and safety boundaries as read-only local metadata; root/settings/demo/runbook/contact navigation and E2E coverage include it without hard deletion, record restoration, exports, mutations, provider calls, billing records, notifications, live AI, SMS, secrets, or live feature enablement.
- Post-MVP local queue operations view: `/settings/queue` renders scheduled-campaign queue status counts, due/future timing, payload validity, worker settings, queue backend metadata, Redis presence, idempotency keys, and safety boundaries as read-only local metadata; root/settings/demo/campaign/system navigation and E2E coverage include it without enqueueing jobs, running workers, mutating queue rows, updating campaigns, calling Redis, provider calls, billing records, notifications, SMS, secrets, or live messaging enablement.
- Post-MVP local notification operations view: `/settings/notifications` renders email, in-app, SMS alert, and webhook no-send boundaries, runtime gate status, provider status, production override status, and future notification-provider gate requirements as read-only local metadata; root/settings/demo/security/system navigation and E2E coverage include it without creating recipients, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, notifications, SMS, email, mutations, secrets, or live feature enablement.
- Post-MVP local readiness audit operations view: `/settings/readiness-audit` renders tenant-scoped local readiness audit events, action/subject filters, local metadata, actor IDs, timestamps, and bounded CSV export links as read-only local metadata; root/settings/demo/admin export navigation and E2E coverage include it without mutating audit events, exposing secrets, provider calls, billing records, live AI calls, notifications, SMS, email, or live feature enablement.
- Post-MVP operator runbook navigation refresh: `/settings/runbook` links the current local admin surfaces, including queue operations, delivery operations, readiness audit, and provider numbers, and the seeded investor demo E2E covers those links without executing commands, mutating records, provider calls, billing records, notifications, live messaging, or secrets.

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
- Good candidate slices: additional read-only admin views, safe dashboard refinements, local operator runbook expansion, API route inventory refinements, deeper links from existing local-only reports into demo-safe operational workflows, or local export/status views that reuse existing data without new external-impact actions.
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
