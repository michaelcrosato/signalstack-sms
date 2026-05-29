# ROADMAP

AFK-readiness roadmap. The **product** roadmap is `PLAN.md` (phases 0–3) and
`docs/CANONICAL_IMPLEMENTATION_PLAN.md` is the governing contract. This file maps near-term,
agent-executable work to tickets in `tickets/`.

## Assessment

Mature, demo-safe codebase with a single aggregated gate (`npm run validate`), ~795 unit tests,
extensive executable policy gates, and prior agent tooling. Gaps addressed for AFK use: no
`GOAL.md`/`ROADMAP.md`/`tickets/`/`.aiignore`/`docs/ai/REPO_MAP.md`, no POSIX agent scripts, a
gate-breaking `context:check` bug, a confusing standalone `db:validate` (missing `.env`), and a
677KB `LOOP_LOG.md` (plus a 621KB `docs/` duplicate) of token bloat. All now resolved.

## Phases

| Phase | Focus | Status | Tickets |
| --- | --- | --- | --- |
| 0. Stabilize | Green gate, fix correctness risks | gate green except e2e | TICKET001 ✅, TICKET002 |
| 1. Tooling / deps | Reproducible onboarding, agent scripts | done | TICKET001 ✅ |
| 2. Docs / repo-map | Orientation in minutes | done; keep current | TICKET004 |
| 3. Bugs / tests | Close known gaps + regressions | open | TICKET003, TICKET005 |
| 4. Modularity | Reduce over-indexed operations/test surface | open | (see PLAN.md Phase 0) |
| 5. Features | Product demo polish | open | PLAN.md Phase 1 |
| 6. Live readiness / CI | Controlled live behind hard gates | blocked (human) | PLAN.md Phase 2–3 |

## Prioritized near-term work

1. **TICKET002** — verify full local gate incl. `test:e2e:smoke` against real Postgres + Playwright. (P1)
2. **TICKET003** — add demo-safe local outbound inbox reply (current matrix gap). (P2)
3. **TICKET005** — regression test so `context:check` never again hard-requires a removed history file. (P2)
4. **TICKET004** — keep `docs/ai/REPO_MAP.md` + `docs/CURRENT_STATE_MATRIX.md` current. (P3, recurring)

## Risks / blockers

- e2e/migrate/seed need a running Postgres; not available in every agent sandbox → record as "not run".
- Test suite is over-indexed on syntactic `globalThis`-alias auth variants; avoid adding more — trimming needs care to not drop real coverage.
- Hard gates (live SMS/billing/AI, prod auth/workers, secrets, destructive DB) are human-only; do not attempt autonomously.

## Maintenance loop

Run the loop in `AGENTS.md` every session: `status -> read GOAL/ROADMAP/REPO_MAP + top ticket ->
one small ticket -> change -> targeted then broad checks -> update docs+ticket -> file follow-ups ->
summarize`. Keep this file and `PLAN.md` concise; history lives in `git log`.
