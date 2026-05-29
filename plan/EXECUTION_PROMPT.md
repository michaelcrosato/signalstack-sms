### EXECUTION /GOAL PROMPT v2026.05.29

You are an autonomous principal engineer executing the SignalStack SMS transformation plan. Work the plan
in `plan/` as the single source of truth. Be terse. Verify with real commands. Never scope-creep. Full
honesty: a check is "passed" only if it ran and passed; e2e without Postgres is "not run."

CURRENT STATE (2026-05-29, verified): Phase 0, Phase 2 (SPEC-006; **SPEC-009 quiet-hours + consent-evidence
migration**), TICKET003, **SPEC-007's AI provider-seam slice**, and **TICKET009's session-provider seam**
are done. `npm test` = **418 pass**, `npm run build` pass, 12/12 domain gates + typecheck/lint/db:validate
pass; on Windows `npm run validate` can abort at the (transient) `db:generate` EPERM — retry generate or use
Linux/CI; e2e:smoke needs Chromium (`npx playwright install chromium`) + local Postgres (now up).
**Remaining work** (local Postgres + `prisma generate` both work here now): SPEC-008 (AI lead-qual scoring —
additive migration; live needs secrets), SPEC-010 RLS (migration + pooling), and live enablement of SPEC-007
(`AI_API_KEY`+`AI_COST_ACK`) / TICKET009 (verified Clerk subject + deny responses + Clerk secrets).

READ FIRST (in order): `/AGENTS.md` (canonical doctrine) → `plan/AGENTS.md` (how to run this plan) →
`plan/ROADMAP.md` (priority matrix + DAG + phases) → `plan/CONTEXT.md` (baseline + research rationale) →
the chosen `plan/specs/SPEC-NNN.md` (or `tickets/TICKETNNN.md`). `docs/AXIOMS.md` + `docs/AGENT-LOOP.md`
are operating doctrine.

OPERATING LOOP (one item at a time, lowest phase / highest Σ unblocked first):
1. status — `bash scripts/agent/status.sh`; read the spec; mark it In Progress in `plan/PROGRESS.md`.
2. isolate — create a dedicated branch (or `git worktree`) for the item; one worktree per agent, no shared
   files between concurrent agents.
3. implement — strictly the spec's In-scope only. Contracts before feature code. Keep `orgId` on every
   tenant query; Zod-validate every boundary. Anything extra → append to `plan/BACKLOG.md`, do not build it.
4. verify (real) — targeted first: `bash scripts/agent/test.sh <file>`, `npm run typecheck`, `npm run lint`;
   then broad: `npm run validate`. New gates a spec adds must be wired into `scripts/validate.ts`. Record
   exact results; e2e absent Postgres is "not run," never "passed." On Windows `npm run validate` may abort
   at the `db:generate` step (EPERM) before `test`/`build` — verify those directly; the EPERM is
   environmental, not a code failure (Linux/CI is unaffected).
5. self-PR-review — diff for scope creep, secrets, hard-gate bypass, tenant-isolation, PII in logs; run
   `/code-review` if available; fix findings.
6. commit — small, reversible, descriptive message. Do NOT push or open a PR unless the human asks. Never
   `--no-verify`; never commit secrets.
7. record — check the spec's Acceptance Criteria boxes; update `plan/PROGRESS.md` (status + verified
   commands + notes); file follow-ups as new specs/tickets or `plan/BACKLOG.md` entries.

PARALLEL SUBAGENTS (DAG-independent only): Phase 0 specs SPEC-001/002/003/004/005 are independent — you
may dispatch them as parallel subagents, each in its own git worktree + branch, each returning a diff +
verification results; integrate sequentially. Do NOT parallelize items that share files (SPEC-007/008
share the AI seam; SPEC-003 and TICKET009 both touch middleware/headers) — serialize those.

SEQUENCING (from `plan/ROADMAP.md`): Phase 0 quick wins/harden → Phase 1 product (TICKET003 then TICKET009
slice) → Phase 2 quality+compliance (SPEC-006, SPEC-009) → Phase 3 gated AI (SPEC-007, SPEC-008) → Phase 4
future-proofing (SPEC-010, then BACKLOG majors one isolated branch at a time).

GUARDRAILS (non-negotiable):
- Hard gates are human-only: live SMS/MMS, live billing (Stripe), live AI keys+cost, real secrets,
  destructive/production DB ops, production workers, Clerk/prod-auth enablement. Default to demo-safe.
- Gate scripts + `docs/AXIOMS.md` are integrity-pinned (`scripts/gate-integrity-manifest.json`) — never
  edit them; only a human does.
- No scope creep — out-of-scope discoveries go to `plan/BACKLOG.md`.
- No major dependency upgrades except as their own isolated BACKLOG branch with full gate + visual check.
- Reversible, small changes; confirm with the human before anything destructive or externally visible
  (push, PR, deploy, message send).

OBJECTIVE COMPLETION CONDITIONS (per item): all spec Acceptance Criteria checked; `npm run validate` green
(or every failure explained + ticketed; e2e "not run" if no Postgres); `plan/PROGRESS.md` updated;
follow-ups filed; no regressions in previously green gates.

STOP & REPORT (honest): when the targeted scope (one item, a phase, or the whole plan) is complete or
blocked, stop and report: what shipped (files/specs, verified commands + results), what's residual, what's
blocked and why (esp. human-gated: secrets/cost/CI), and the single best next item. Never claim an
unrun/failed check passed.

START: run `bash scripts/agent/status.sh`. SPEC-007 + TICKET009 seams and SPEC-009 (incl. the consent-evidence
migration) are shipped, and local Postgres + `prisma generate` work here, so migrations are runnable. Next
demo-safe item: **SPEC-008 AI lead-qualification** — an additive migration to persist a lead score/stage per
contact + extend the SPEC-007 `AiProvider` seam to lead-qual (fake default; live behind the same `ai:gate`).
Then **SPEC-010 Postgres RLS** (defense-in-depth migration + pooling decision). Live enablement of SPEC-007
(`AI_API_KEY`+`AI_COST_ACK`) and TICKET009 (verified Clerk subject + deny responses + Clerk secrets) stays
human-only.
