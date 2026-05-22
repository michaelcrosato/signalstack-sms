# Plan

This repo follows `docs/CANONICAL_IMPLEMENTATION_PLAN.md`. That canonical plan remains the governing implementation contract; this file is the short operational roadmap.

## Current Reality

As of 2026-05-21:

- The repo has strong demo-safe foundations: data model, tenant boundaries, contracts, validation gates, seed data, local worker paths, Twilio webhook foundations, read-only operations surfaces, and automated tests.
- The browser experience now has a product-facing dashboard, contacts, contact restore/merge, campaigns, campaign detail/edit/cancel, inbox, templates, template detail/edit, analytics, and compliance flow, with remaining gaps around demo polish and production readiness.
- Live messaging remains blocked by default. The only intentional live external-impact path is the isolated `/demo` live-test SMS surface, which requires explicit Twilio credentials, live flags, a recipient allowlist, and the confirmation phrase.
- Live campaign sending, live AI, live billing, real auth, production secret management, production Redis/rate-limit infrastructure, and production deployment are not complete.
- Planning inputs from Claude, Gemini, Grok, and Codex are captured under `planning/`; the current consensus is summarized in `planning/CONSENSUS-2026-05-21.md`.

## Completed Foundations

- Milestone 0: repo skeleton, source-of-truth docs, contract stubs, demo-safe env defaults, Prisma/Next foundations, smoke tests, CI/validation skeleton.
- Milestone 1: organization/auth foundations, deterministic demo current user, tenant helper guardrails, `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import parser, demo-safe import endpoint, tenant-scoped repositories and tests.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight contract, no live SMS sending.
- Milestone 4: durable queue job records, schedule/cancel API foundations, hard gates before provider behavior.
- Milestone 5: shared inbox APIs, demo inbound creation, assignment, notes, resolve/reopen, STOP/HELP local parsing.
- Milestone 6: centralized messaging hard gate, compliance profile/checklist APIs, live-message blocker tests.
- Milestone 7: deterministic fake AI provider and local AI endpoints with live AI blocked by default.
- Milestone 8: local usage/billing records, analytics overview, billing usage APIs, live billing blocked by default.
- Milestone 9: `/demo` investor console and deterministic Playwright demo path.
- Milestone 10: contract drift gate, tenant invariant checks, named seeded demo E2E script, local-gate documentation.
- Post-MVP foundations: Twilio webhook ingestion/status updates, provider metadata, readiness audit, optional BullMQ/Redis queue path, production gate, rate limiting, operations inventory, local validation runner, weekend loop fuse default, and gated live-test SMS.

## Planning Consensus

- Claude's useful warning: stabilize the product boundary before adding more breadth. Fix latent production defects such as RBAC enforcement, send-time consent rechecks, idempotency scoping, and test balance.
- Gemini's useful warning: real provider proof matters. The gated live-test SMS path now covers that immediate investor proof; broader live provider work should stay behind explicit gates.
- Grok's useful warning: the repo is over-indexed on operations surfaces. The next visible value is a product-first workflow that an investor or owner can drive in the browser.
- Codex judgment: keep the hard gates, preserve the backend foundation, and make the next roadmap phase about a concise product UI plus a few high-risk backend correctness fixes.

## Active Roadmap

### Phase 0: Truth And Stabilization

Goal: make the repo understandable in minutes and remove known correctness risks before expanding live behavior.

- Maintain this short plan plus `docs/CURRENT_STATE_MATRIX.md` as the current source of operational truth.
- Keep the canonical implementation plan and contracts intact.
- Stop adding new read-only operations surfaces unless they unblock product or release safety.
- Keep mutating-route RBAC enforcement covered while production auth is still pending.
- Keep contact consent rechecks at send time in worker/send paths.
- Keep idempotency keys tenant-scoped where cross-tenant key reuse is legitimate.
- Keep live SMS, billing, AI, secrets, destructive DB operations, production worker execution, and production side effects hard-gated.
- Keep `docs/PRODUCTION_WORKER_POLICY.md`, the `WORKER_DEPLOYMENT_CLASS=local-demo` executable guard, explicit all-marker production-like worker blocking, and the frozen public-field-only `production-live-campaign` control metadata as the gate before any live campaign worker or production worker deployment work starts. The reserved `production-live-campaign` planning label remains blocked until every future live-worker control is implemented.
- Keep `npm run validate` and the local gate green.

### Phase 1: Product UI Investor Demo

Goal: make SignalStack feel like usable SMS software, not only a system audit console.

- Product shell at `/dashboard` has primary navigation for contacts, campaigns, inbox, templates, analytics, compliance, and settings.
- Keep the contacts list/import/detail UI on existing APIs, including local soft archive, restore, and duplicate merge.
- Campaign composer, recipient selection, preflight, schedule, detail, draft edit, and queued-campaign cancel UI on existing APIs are in place for the first product demo path.
- Inbox list/thread UI with demo inbound, assignment, notes, resolve/reopen, and STOP visibility is in place on existing APIs.
- Template list/create/detail/edit UI and contact detail/edit/merge UI are in place on existing APIs.
- Keep the gated live-test SMS demo available but visually separated from normal campaign sending.
- `e2e/product-demo-path.spec.ts` covers the non-technical browser demo path across dashboard, contacts, campaigns, inbox, templates, analytics, and compliance.

### Phase 2: Controlled Live Readiness

Goal: prepare for real customer pilots without weakening safety boundaries.

- Harden Twilio provider adapter work beyond the isolated live-test SMS path.
- Add production secret storage discipline and redact-only configuration surfaces.
- Add real auth/RBAC, likely Clerk-backed, with route-level enforcement.
- Move rate limiting and queue execution to production-grade infrastructure when configured.
- Add production observability without logging secrets, message bodies beyond intended records, or provider credentials.
- Document A2P, opt-out, HELP, quiet-hours, and audit requirements before live campaign sending.

### Phase 3: Billing, Live AI, And Scale

Goal: turn the demo-safe product into a paid production SaaS.

- Add Stripe billing only behind explicit live billing gates.
- Add live AI only behind explicit provider, cost, and data-use controls.
- Complete A2P/provider registration workflows and compliance evidence.
- Expand multi-provider strategy only after Twilio pilot paths are production-safe.

## Next Concrete Work

1. Keep `docs/CURRENT_STATE_MATRIX.md` current.
2. Keep the product demo path stable while collecting review feedback.
3. Continue hardening the executable `production-live-campaign` control checklist, without adding it to supported worker classes until every listed control is implemented.
