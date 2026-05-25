# Next Prompts

This is the compact handoff for the next automated loop. Full history is in `LOOP_LOG.md` and `docs/LOOP_LOG.md`; do not reload historical logs unless the task requires it.

## Read First

1. `docs/AXIOMS.md`
2. `docs/AGENT-LOOP.md`
3. `npm run agent:brief`
4. `PLAN.md`
5. `docs/CURRENT_STATE_MATRIX.md`
6. `planning/CONSENSUS-2026-05-21.md`
7. `contracts/**` with targeted reads
8. `docs/LOCAL_GATE.md`

## Current State

- Latest validated run: Run 812 makes campaign-detail recent outbound delivery evidence rows render newest-first from the product projection while aggregate metrics still use all outbound campaign messages.
- Run 811 adds a product analytics `Last delivery evidence` row derived from the newest tenant-scoped outbound local message timestamp.
- Run 810 adds a product dashboard `Last delivery evidence` signal derived from the newest tenant-scoped outbound local message timestamp.
- Run 809 adds a product dashboard `Delivery review` signal derived from existing tenant-scoped outbound local message counts, sharing the same status wording as campaign and analytics reporting.
- Run 808 adds a product analytics `Review status` delivery signal derived from existing tenant-scoped outbound local message counts, sharing the same status wording as campaign reporting.
- Run 807 closes a direct BullMQ worker construction bypass by forcing the exported construction helper through the same startup readiness gate as the public start helper.
- Run 806 adds a dashboard delivery evidence signal from existing outbound local message counts.
- Run 805 adds latest outbound evidence visibility to campaign-list delivery reporting from existing local message records.
- Run 804 adds a campaign delivery review status to product campaign list/detail reporting from existing local outbound message evidence.
- Run 803 adds an executable API RBAC matrix at `lib/auth/api-rbac-matrix.ts` and cross-checks it against every mutating `app/api/**/route.ts` method plus the signed Twilio webhook exceptions.
- Run 802 adds a campaign-detail `Recent Evidence Rows` metric showing visible recent outbound evidence rows against the all-outbound local message total.
- Run 801 makes campaign-detail recipient block reasons human-readable and adds explicit delivery snapshot copy that metrics aggregate all outbound campaign messages while visible rows remain recent-only.
- Run 800 makes campaign-detail delivery metrics aggregate all outbound campaign messages while keeping visible delivery rows recent-only.
- Run 799 adds a local last-outbound-message metric to `/dashboard/campaigns/:campaignId`.
- Run 798 adds a local outbound delivery-rate metric to `/dashboard/campaigns/:campaignId`.
- Run 797 adds aggregate local recipient-readiness metrics to `/dashboard/campaigns/:campaignId`.
- The backend foundation is strong: tenant helpers, contacts, campaigns with missing/cross-tenant requested preflight contact IDs blocked, queue jobs with schedule-time stale queued-job cancellation, tenant-explicit local outbound worker idempotency keys, per-recipient send-time skips, local outbound provider-status preservation, BullMQ worker startup and direct construction gates, inbox with explicit inbound duplicate side-effect prevention, compliance gates, fake AI, local billing/analytics, provider metadata, Twilio webhook foundations with duplicate-race handling, readiness audit, operations inventory, and validation gates.
- The browser product has a usable local demo path across dashboard with next-step and centralized outbound-only local delivery evidence/rate/pending/failure/review/latest-evidence signals, contacts import/detail/archive/restore/merge, campaign fake-AI copy/preflight count/schedule/detail/edit/cancel plus campaign-list recipient readiness and delivered/pending/failed/rate/review-status/latest-evidence reporting, campaign-detail aggregate recipient readiness, all-outbound delivery-rate/count/review-status/last-message metrics, visible recent-evidence row count, explicit recent-row boundary copy and newest-first recent delivery rows, recipient send-state/human-readable block reasons, mutually exclusive outbound-only delivery detail visibility with per-row delivery states, inbox query-selected thread work, template create/detail/edit, analytics delivery review/latest-evidence status plus delivery operations with outbound-only `failed`/`undelivered` breakdowns, and compliance readiness.
- Live campaign sending, live billing, live AI, production auth, production secrets, production workers, and production deployment remain blocked by default.
- Production auth/RBAC now has a checked planning document at `docs/PRODUCTION_AUTH_RBAC.md`, an executable mutating-route RBAC matrix, `npm run production-auth:check` as part of validation, and production-like demo deployments reject Clerk auth configuration with `CLERK_AUTH_CONFIG_PRESENT` until explicit controls exist.
- The only intentional live external-impact route is the isolated `/demo` live-test SMS path, gated by explicit Twilio credentials, live flags, recipient allowlist, and confirmation phrase; accepted Twilio statuses are normalized before local evidence is stored or returned.
- Twilio webhook handlers fail closed on malformed or unsupported form bodies before signature validation, tenant lookup, webhook-event storage, or local inbox/delivery mutations; route-level tests also pin invalid signatures, duplicate-event no-ops, and current-tenant status updates.
- Auth scanner, API RBAC matrix, BullMQ direct startup gating, and live-worker hardening coverage are already very broad. Do not spend another loop on minor syntactic variants unless a concrete uncovered parser/control-flow gap is proven with targeted search.

## Next Work

1. Keep the product demo path stable and run the protected local gate before treating changes as green.
2. Prefer high-signal product-demo or production-readiness correctness work over more low-value syntactic test variants.
3. Good next targets: concise product demo polish, real auth/RBAC only after a concrete Clerk/session design slice is selected, campaign-level reporting detail after feedback, idempotency scoping checks, or targeted live-worker controls that close a named gap.
4. Keep operations surfaces read-only and avoid expanding settings pages unless it directly supports release safety.
5. Keep all live SMS/provider/billing/AI/secret/destructive-production actions behind hard gates.

## Context Discipline

- Start with `npm run agent:brief`, file heads/tails, current summaries, `git status`, `git log -3`, and targeted `rg`.
- Avoid reading full `SUMMARY.codex.md`, `BLOCKERS.codex.md`, `LOOP_LOG.md`, `docs/LOOP_LOG.md`, `docs/CURRENT_STATE_MATRIX.md`, or very large tests unless the next change requires exact historical context.
- If a handoff file starts growing into a run log, compact it and rely on the append-only logs for history.
- `npm run context:check` enforces the current-handoff budget during validation.
