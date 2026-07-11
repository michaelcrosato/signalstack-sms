# Next Prompts

This is the compact handoff for the next automated loop. History lives in `git log`; do not reload historical context unless the task requires it.

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

- Latest validated run: Run 819 surfaces provider error-code evidence in campaign detail delivery snapshots without provider calls.
- Run 818 adds seeded delivered, pending, and failed local outbound delivery evidence so fresh demos show realistic delivery-review states without live providers.
- Run 817 adds failed and pending summary counts to the product analytics delivery review queue.
- Run 816 adds visible/hidden and needs-review summary counts to the product analytics delivery review queue.
- Run 815 adds a product analytics delivery review queue linking campaign-level local evidence to existing campaign detail pages.
- Run 814 adds a product dashboard `Review delivery evidence` next-step card linking to analytics from existing outbound local delivery counts.
- Run 813 routes GitHub CI and premerge validation through the protected local gate so workflow green status includes gate-integrity verification before `npm run validate`.
- Run 812 makes campaign-detail recent outbound delivery evidence rows render newest-first from the product projection while aggregate metrics still use all outbound campaign messages.
- Run 811 adds a product analytics `Last delivery evidence` row derived from the newest tenant-scoped outbound local message timestamp.
- Run 810 adds a product dashboard `Last delivery evidence` signal derived from the newest tenant-scoped outbound local message timestamp.
- Run 809 adds a product dashboard `Delivery review` signal derived from existing tenant-scoped outbound local message counts, sharing the same status wording as campaign and analytics reporting.
- Run 808 adds a product analytics `Review status` delivery signal derived from existing tenant-scoped outbound local message counts, sharing the same status wording as campaign reporting.
- Run 807 closes a direct BullMQ worker construction bypass by forcing the exported construction helper through the same startup readiness gate as the public start helper.
- Run 806 adds a dashboard delivery evidence signal from existing outbound local message counts.
- Run 805 adds latest outbound evidence visibility to campaign-list delivery reporting from existing local message records.
- Run 804 adds a campaign delivery review status to product campaign list/detail reporting from existing local outbound message evidence.
- Run 803 adds an executable API RBAC matrix at `lib/auth/api-rbac-matrix.ts` and cross-checks it against every mutating `app/api/**/route.ts` method plus the signed Twilio webhook exceptions.
- The backend foundation is strong: tenant helpers, contacts, campaigns with missing/cross-tenant requested preflight contact IDs blocked, queue jobs with schedule-time stale queued-job cancellation, tenant-explicit local outbound worker idempotency keys, per-recipient send-time skips, local outbound provider-status preservation, BullMQ worker startup and direct construction gates, inbox with explicit inbound duplicate side-effect prevention, compliance gates, fake AI, local billing/analytics, provider metadata, Twilio webhook foundations with duplicate-race handling, readiness audit, operations inventory, and validation gates.
- The browser product has a usable local demo path across dashboard with seeded delivered/pending/failed local outbound evidence, next-step delivery evidence review, and centralized outbound-only local delivery evidence/rate/pending/failure/review/latest-evidence signals, contacts import/detail/archive/restore/merge, campaign fake-AI copy/preflight count/schedule/detail/edit/cancel plus campaign-list recipient readiness and delivered/pending/failed/rate/review-status/latest-evidence reporting, campaign-detail aggregate recipient readiness, all-outbound delivery-rate/count/review-status/last-message/provider-status/provider-error-code metrics, visible recent-evidence row count, explicit recent-row boundary copy and newest-first recent delivery rows with provider error-code evidence, recipient send-state/human-readable block reasons, mutually exclusive outbound-only delivery detail visibility with per-row delivery states, inbox query-selected thread work, template create/detail/edit, analytics delivery review/latest-evidence status plus campaign-level delivery review summary/links with failed/pending count labels and delivery operations with outbound-only `failed`/`undelivered` breakdowns, and compliance readiness.
- Live campaign sending, live billing, live AI, provider secrets, production workers, and the complete production package remain blocked by default. Built-in local identity is complete and deterministic identity is demo-only.
- Production auth/RBAC has a checked implementation contract at `docs/PRODUCTION_AUTH_RBAC.md`, an executable mutating-route RBAC matrix, `npm run production-auth:check`, keyed opaque sessions, operator recovery, and a production browser proof; Clerk remains optional and accidental configuration is blocked with `CLERK_AUTH_CONFIG_PRESENT`.
- GitHub `ci` and `premerge` workflows now run `pwsh ./scripts/local-gate.ps1` with demo-safe defaults after install/browser setup, and unit coverage pins that they do not treat raw `npm run validate`/`premerge` calls as green.
- The only intentional live external-impact route is the isolated `/demo` live-test SMS path, gated by explicit Twilio credentials, live flags, recipient allowlist, confirmation phrase, and a server-only operator token; public readiness is last-four/count only, and ambiguous provider outcomes stay durably pending without resend.
- Twilio webhook handlers fail closed on malformed or unsupported form bodies before tenant lookup or local mutation, acquire expiring owner leases for valid signed events, release failed/unmatched work for explicit upstream retry, return processed duplicates as no-ops, and apply monotonic current-tenant status updates. Trusted provider-account/number tenant routing remains TICKET023.
- Queue cancellation and worker claims are owner-token, lease, and transaction guarded with Postgres tests for both race winners; BullMQ mirror IDs use durable generations and recoverable processor outcomes retry instead of disappearing.
- `docs/PR_REVIEW_2026-07-10.md` is the disposition ledger for every original PR #60–#153; do not reopen superseded or declined proposals without new evidence.
- Auth scanner, API RBAC matrix, BullMQ direct startup gating, and live-worker hardening coverage are already very broad. Do not spend another loop on minor syntactic variants unless a concrete uncovered parser/control-flow gap is proven with targeted search.

## Next Work

M0 and M1 in `docs/STANDALONE_ROADMAP.md` are DONE. The active queue is M2: same-tenant composite
constraints, a non-owner application database role, fail-closed request-local tenant context/RLS, and
mandatory two-tenant PostgreSQL proof. Continue to M3/M4 only after that trust boundary closes.

Rules: run the protected gate (`pwsh scripts/local-gate.ps1`, now fully green incl `e2e:smoke` after
`npm run afk:preflight`) before treating work as green; commit only when green. Keep all live
SMS/provider/billing/AI/secret/destructive-production actions behind hard gates. When the queue is exhausted,
only human-gated work + `plan/BACKLOG.md` remain — promote a BACKLOG item to a `plan/specs/SPEC-NNN.md`
before building it.

## Context Discipline

- Start with `npm run agent:brief`, file heads/tails, current summaries, `git status`, `git log -3`, and targeted `rg`.
- Avoid reading full `SUMMARY.codex.md`, `BLOCKERS.codex.md`, `docs/CURRENT_STATE_MATRIX.md`, or very large tests unless the next change requires exact historical context.
- If a handoff file starts growing into a run log, compact it and rely on the append-only logs for history.
- `npm run context:check` enforces the current-handoff budget during validation.
