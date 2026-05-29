# plan/AGENTS.md — execution rules for this plan

**This is a thin pointer.** The canonical agent doctrine is the repo-root **`/AGENTS.md`** (read-first
order, the loop, command reference, autonomous-vs-ask, token efficiency, hard gates). Read it first.
`docs/AXIOMS.md` + `docs/AGENT-LOOP.md` are the operating doctrine. This file only adds how to consume
`plan/`.

## How to execute the plan
1. Read `plan/ROADMAP.md` (priority matrix + DAG + phases) and `plan/CONTEXT.md` (rationale).
2. Pick the highest-priority **unblocked** item (its DAG prereqs done): a `plan/specs/SPEC-NNN.md` or an
   existing `tickets/TICKETNNN.md`. Prefer lowest phase first.
3. Follow the loop below; update `plan/PROGRESS.md` and the spec's checkboxes as you go.

## Operating loop (per item)
`status → read spec → isolate (branch/worktree) → implement strictly to the spec → verify (real
commands) → self-PR-review → commit → record in plan/PROGRESS.md → file follow-ups`.
- **Isolate:** one branch (or git worktree) per item; never two agents in the same worktree.
- **Implement strictly:** only the spec's In-scope. Anything else → `plan/BACKLOG.md`, do not do it now.
- **Verify (real, not claimed):** targeted first (`bash scripts/agent/test.sh <file>`, `typecheck`,
  `lint`), then broad `npm run validate`. A check is "passed" only if it ran and passed; e2e without
  Postgres is "not run."
- **Self-review:** diff for scope creep, secrets, hard-gate bypass, tenant-isolation (`orgId`), PII in
  logs. Run `/code-review` if available.
- **Commit:** small, reversible, descriptive. **Do not push or open PRs unless the human asks.** Never
  commit secrets. Never `--no-verify`.

## Verification command reference (full suite)
`npm run validate` (= 19-step gate). Components: `typecheck`, `lint`, `test` (vitest), `build`,
`db:validate`, `db:generate`, and domain gates `contracts:check secrets:scan compliance:check
production:gate production-auth:check production-worker:check observability:check operator:check
platform:check context:check security:check ai:check`. E2E (needs Postgres + Chromium):
`test:e2e:smoke|:demo|:product-demo`.
New gates added by specs (e.g. `security:headers`) must be wired into `scripts/validate.ts`.

## Parallelism (DAG-independent only)
Phase 0 specs (SPEC-001/002/003/004/005) are independent → safe to run as **parallel subagents in
separate worktrees**. Do **not** parallelize items sharing files (e.g. SPEC-007 and SPEC-008 share the AI
seam; SPEC-003 and TICKET009 both touch `middleware.ts`/headers — serialize or coordinate). Each subagent:
own worktree, own branch, returns a diff + verification results; the orchestrator integrates sequentially.

## Hard gates (human-only — never bypass)
Live SMS/MMS, live billing (Stripe), live AI provider keys + cost, real secrets, destructive/production DB
ops, production worker execution, Clerk/prod-auth **enablement**. Gate scripts + `docs/AXIOMS.md` are
integrity-pinned (`scripts/gate-integrity-manifest.json`) — only a human edits them.

## Completion (per item)
All spec Acceptance Criteria checked; `npm run validate` green (or each failure explained + ticketed; e2e
"not run" if no Postgres); `plan/PROGRESS.md` updated; follow-ups filed. Do not mark done on partial work.
