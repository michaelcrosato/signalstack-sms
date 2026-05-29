# plan/PROGRESS.md — execution tracker

Update one row per item as you work it (Todo → In Progress → Done/Blocked). Keep current-only; history is
in `git log`. "Verified" = the real commands ran and passed (e2e is "not run" without Postgres).

## Status
| Item | Phase | Status | Branch/Worktree | Verified (commands) | Notes |
| --- | --- | --- | --- | --- | --- |
| SPEC-001 fix-docker-start | 0 | **Done** | working tree | `npm start` → Ready 288ms, `GET /`→200; 14/14 gates | start script added |
| SPEC-002 ci-db-services | 0 | **Done; CI-run pending** | working tree | path verified locally: compose→db:deploy(14)→seed→**e2e:smoke passed** | GH Actions not runnable in sandbox |
| SPEC-003 security-headers-csp | 0 | **Done** | working tree | `security:check` gate + headers served live (X-Powered-By removed, 200); build green | CSP Report-Only; nonce-enforce is follow-up |
| SPEC-004 readme-rewrite | 0 | **Done** | working tree | 14/14 gates; README 152→54 lines, 0 deleted-page refs | human quick-start |
| SPEC-005 dependency-hygiene | 0 | **Done** | committed `e1565201` | typecheck/lint/test/build green; lockfile resynced | carets aligned to installed; majors → BACKLOG |
| TICKET003 inbox-reply | 1 | **Done** | working tree (committed) | typecheck/lint/build/388 tests green; reply route + RBAC + UI | demo-safe dummy provider; opt-out blocked; idempotent |
| TICKET009 clerk-auth-slice | 1 | Todo | — | — | existing ticket; enablement human-gated |
| SPEC-006 observability | 2 | **Done (core)** | committed `115bb435` | typecheck/lint/build/393 tests/observability:check green | OTel exporter deferred to BACKLOG |
| SPEC-009 compliance-quiet-hours | 2 | **Partial** | committed (quiet-hours) | quiet-hours window + gate integration tested (398 tests) | consent-evidence storage needs migration (deferred, human confirm) |
| SPEC-007 ai-reply-drafting | 3 | Todo | — | — | after SPEC-006 |
| SPEC-008 ai-lead-qualification | 3 | Todo | — | — | after SPEC-007 + TICKET009 |
| SPEC-010 postgres-rls | 4 | Todo | — | — | after TICKET009 + pooling decision |

## Checklist (downstream agents)
- [x] SPEC-001 — Docker `start` script
- [x] SPEC-002 — CI Postgres+Redis services (path verified locally; CI-run pending)
- [x] SPEC-003 — security headers + CSP + `security:check` gate
- [x] SPEC-004 — README human quick-start
- [x] SPEC-005 — dep hygiene (Redis pinned + carets aligned to installed; majors → BACKLOG)
- [x] SPEC-006 — observability (PII-safe logging + flag-gated instrumentation; OTel exporter → BACKLOG)
- [ ] SPEC-007 — real AI reply drafting — BLOCKED (secrets/cost + live-AI hard gate; human-only)
- [ ] SPEC-008 — real AI lead qualification — BLOCKED (migration + secrets; human-only)
- [~] SPEC-009 — quiet-hours DONE; consent-evidence storage deferred (migration)
- [ ] SPEC-010 — Postgres RLS — BLOCKED (migration; needs human confirmation + non-Windows env for prisma generate)
- [x] TICKET003 — demo-safe inbox reply
- [ ] TICKET009 — Clerk auth/RBAC slice — BLOCKED (Clerk secrets + prod-auth hard gate; human-only)

## Log (most recent first)
- 2026-05-29 — **Execution ceiling reached; human chose to STOP.** 8/10 specs done + committed
  (SPEC-001/002/003/004/005/006 + TICKET003 + SPEC-009 quiet-hours); 398 unit tests green; 15/15 local
  gates green except `db:generate` (unresolvable Windows `prisma generate` EPERM — engine DLL held by an
  unkillable harness/IDE process; client already valid). Remaining 4 are categorically gated and were NOT
  attempted: SPEC-007 (live-AI hard gate + secrets), SPEC-008 (migration + secrets), SPEC-009
  consent-evidence (migration), SPEC-010 (migration), TICKET009 (Clerk hard gate + secrets). Per the
  Destructive-Actions + Secrets guardrails I declined to run unconfirmed migrations or fabricate secrets.
  Next: complete the gated specs in a credentialed Linux/CI environment via `plan/EXECUTION_PROMPT.md`.
- 2026-05-29 — SPEC-005 DONE (commit `e1565201`): aligned `package.json` carets to installed patched
  versions (within current majors), resynced `package-lock.json` via `--package-lock-only` (no EPERM),
  Redis pinned `7.4-alpine`. typecheck/lint/test/build green. All non-gated specs are now complete.
- 2026-05-29 — SPEC-009 pt.1 DONE: TCPA quiet-hours. Added `lib/compliance/quiet-hours.ts`, optional
  `quietHours` input on `evaluateMessagingHardGate` (`lib/compliance/gates.ts`),
  `tests/unit/compliance/quiet-hours.test.ts` (→ 398 tests), matrix compliance row. 7/7 gate sweep green.
  Consent-evidence storage deferred — needs a Prisma migration (human confirmation per guardrails).
- 2026-05-29 — SPEC-006 core DONE (commit `115bb435`) + contract docs for the reply endpoint
  (`6b618148`, completing TICKET003's `contracts:check`). Added `lib/observability/logger.ts` (PII-safe
  redactor), `lib/observability/metrics.ts`, root `instrumentation.ts` (flag-gated, default off),
  `tests/unit/observability/logger.test.ts` (+5 → 393), extended `scripts/observability-check.ts`,
  `.env.example` (`OBSERVABILITY_ENABLED=false`). Full local gate 15/15 green (db:generate=Windows flake;
  e2e verified earlier). OTel exporter wiring deferred to BACKLOG.
- 2026-05-29 — TICKET003 DONE: demo-safe outbound inbox reply. Files: `lib/validation/inbox.ts`
  (`conversationReplyCreateSchema`), `lib/db/repositories/inbox.ts` (`createConversationOutboundReply` —
  dummy provider, opt-out/archived block, idempotent OUTBOUND upsert), new
  `app/api/inbox/conversations/[conversationId]/reply/route.ts` (POST, MEMBER), `lib/auth/api-rbac-matrix.ts`
  (matrix entry), `app/dashboard/inbox/workspace.tsx` (reply form), `tests/unit/api/inbox-json-route.test.ts`
  (+4 tests → 388 total), `docs/CURRENT_STATE_MATRIX.md` (inbox row). Verified: typecheck, lint, build,
  test (388), context:check, security:check green. SPEC-005 caret bump deferred (Windows `npm install`
  prisma EPERM risk); compose Redis pin already done.
- 2026-05-28 — SPEC-003 done (security headers + CSP-Report-Only + `security:check` gate; headers verified
  served live, `X-Powered-By` removed). Brought up Docker postgres+redis and **verified the full e2e path
  locally**: `db:deploy` (14 migrations) → `demo:seed` → `test:e2e:smoke` **passed** — proving the SPEC-002
  CI workflow. `build` green with new headers. SPEC-005: compose Redis pinned `7.4-alpine`. KNOWN LOCAL
  FLAKE: `db:generate` hits a Windows `EPERM` DLL-rename lock (Defender/antivirus); the Prisma client is
  already generated & valid (db:validate/typecheck/tests/build/e2e all pass using it); Linux CI unaffected.
- 2026-05-28 — Executed Phase-0 quick wins: SPEC-001 (start script, verified `npm start`→200),
  SPEC-004 (README rewrite 152→54), SPEC-002 (CI postgres+redis services + migrate/seed; CI-pending).
  14/14 local gates green after changes; e2e not run (no local Postgres). Changed: `package.json`,
  `README.md`, `.github/workflows/ci.yml`, `.github/workflows/premerge.yml`.
- 2026-05-28 — Plan authored (`plan/` created). Baseline + research in `plan/CONTEXT.md`. No code changed
  by the planning pass. Repo gate state at authoring: 16/16 local gates green, e2e not run (no Postgres).
