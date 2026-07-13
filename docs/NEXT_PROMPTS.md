# Next Prompts

This is the compact handoff for the next automated loop. History lives in `git log`; do not reload historical context unless the task requires it.

## Read First

1. `docs/AXIOMS.md`
2. `docs/AGENT-LOOP.md`
3. `npm run agent:brief`
4. `PLAN.md`
5. `docs/CURRENT_STATE_MATRIX.md`
6. `contracts/**` with targeted reads
7. `docs/LOCAL_GATE.md`

## Current State

- Latest validated checkpoint: Run 833 completes M5 durable direct messaging. Four migrations extend the
  current substrate to 55 migrations / 40 protected tables with permanent public/inbox reservation,
  immutable message attempts, an exact final-gated stored-credential Twilio worker, bounded definitive
  retry, durable ambiguity, correlated callbacks, provider-fetch reconciliation, and safe ADMIN review.
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
- The backend foundation is strong: tenant helpers, contacts, campaigns, queue jobs, inbox, compliance gates,
  fake AI, local billing/analytics, encrypted provider ownership, exact Twilio callback routing, readiness audit,
  operations inventory, and validation gates. Legacy provider credential/rotation rows remain explicitly
  unverified/display-only; canonical M4 provider-control audit evidence is `IntegrationAuditEvent`.
- The browser product has a usable local demo path across dashboard with seeded delivered/pending/failed local outbound evidence, next-step delivery evidence review, and centralized outbound-only local delivery evidence/rate/pending/failure/review/latest-evidence signals, contacts import/detail/archive/restore/merge, campaign fake-AI copy/preflight count/schedule/detail/edit/cancel plus campaign-list recipient readiness and delivered/pending/failed/rate/review-status/latest-evidence reporting, campaign-detail aggregate recipient readiness, all-outbound delivery-rate/count/review-status/last-message/provider-status/provider-error-code metrics, visible recent-evidence row count, explicit recent-row boundary copy and newest-first recent delivery rows with provider error-code evidence, recipient send-state/human-readable block reasons, mutually exclusive outbound-only delivery detail visibility with per-row delivery states, inbox query-selected thread work, template create/detail/edit, analytics delivery review/latest-evidence status plus campaign-level delivery review summary/links with failed/pending count labels and delivery operations with outbound-only `failed`/`undelivered` breakdowns, and compliance readiness.
- General direct provider sends are available only to the exact `production-live-direct` worker after M5's
  complete live/organization/compliance/contact/current-credential/sender/frontier gate. Defaults remain
  dummy/network-free. Live campaigns, live billing, live AI, and the complete production package remain
  blocked.
- Production auth/RBAC has a checked implementation contract at `docs/PRODUCTION_AUTH_RBAC.md`, an executable mutating-route RBAC matrix, `npm run production-auth:check`, keyed opaque sessions, operator recovery, and a production browser proof; Clerk remains optional and accidental configuration is blocked with `CLERK_AUTH_CONFIG_PRESENT`.
- GitHub `ci` and `premerge` workflows now run `pwsh ./scripts/local-gate.ps1` with demo-safe defaults after install/browser setup, and unit coverage pins that they do not treat raw `npm run validate`/`premerge` calls as green.
- The only intentional live external-impact route is the isolated `/demo` live-test SMS path, gated by explicit Twilio credentials, live flags, recipient allowlist, confirmation phrase, and a server-only operator token; public readiness is last-four/count only, and ambiguous provider outcomes stay durably pending without resend.
- Twilio webhook handlers resolve exactly one verified account plus owned destination, validate with that
  account's active credential, recheck tenant/generation state before persistence, and retain expiring owner
  leases, duplicate no-ops, explicit retry release, and monotonic status updates. Non-owner PostgreSQL routing
  plus HTTP route fixtures cover crossed/unknown/rotated/revoked evidence without a literal server E2E claim.
- Queue cancellation and worker claims are owner-token, lease, and transaction guarded with Postgres tests for both race winners; BullMQ mirror IDs use durable generations and recoverable processor outcomes retry instead of disappearing.
- `docs/PR_REVIEW_2026-07-10.md` is the disposition ledger for every original PR #60–#153; do not reopen superseded or declined proposals without new evidence.
- Auth scanner, API RBAC matrix, BullMQ direct startup gating, and live-worker hardening coverage are already very broad. Do not spend another loop on minor syntactic variants unless a concrete uncovered parser/control-flow gap is proven with targeted search.

## Next Work

M0–M5 in `docs/STANDALONE_ROADMAP.md` are DONE. M2 evidence is a fresh 40-migration/no-diff install under
a non-superuser/non-BYPASSRLS table owner, owner capability barred from runtimes, 27-table fail-closed RLS
with semantic policy fingerprints, composite tenant integrity, exact command-specific control policies,
atomic database-timed dispatch with no public ACL, short tenant/control/dispatch contexts, zero migration-
debt imports, the mandatory eight-file / 33-test tenant matrix, 37 PostgreSQL files / 186 tests, nine auth
database files / 38 tests, and production local-auth build/browser proof 1/1 under a non-owner login. M3's
checkpoint is 43 migrations / 36 protected tables; its 12-file / 49-test mandatory tenant
gate, 30-file / 111-test public API suite, generated OpenAPI/examples, and literal non-owner Next HTTP +
receiver-socket proof cover scoped keys, dummy/local resources, signed events, failure/replay, and secret/key
rotation without a carrier call. M4 reached 51 migrations / 39 protected tables;
its eight migrations, account-hash/AAD-bound AES-256-GCM envelopes, safe ADMIN/provider fixtures, and
two-account non-owner PostgreSQL routing plus HTTP route fixtures close provider identity and ownership. The
M5 extends the current substrate to 55 migrations / 40 protected tables. Its permanent replay, outbox,
frontier/crash/recovery, callback replay/order/cross-tenant, fetch, audit, and single-successor race proof is
in the mandatory 16-file / 65-test tenant runner. The active queue is M6 trusted inbound/shared-inbox
completion, then M7–M11; do not claim those later milestones early.

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
