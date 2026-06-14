# TICKET001 — AFK onboarding: agent scripts, .env bootstrap, ditch LOOP_LOG

- **Status:** Done (2026-05-28)
- **Priority:** P1

## Goal
Make the repo pick-up-able by an autonomous agent: reproducible bootstrap, POSIX agent scripts,
orientation docs, a token-noise ignore file, and a green `context:check`. Remove `LOOP_LOG.md` bloat.

## Context
Mature repo but missing `GOAL.md`/`ROADMAP.md`/`tickets/`/`.aiignore`/`docs/ai/REPO_MAP.md` and POSIX
scripts. `npm run context:check` crashed on a working-tree-deleted `docs/LOOP_LOG.md`; standalone
`npm run db:validate` failed with no `.env`. `LOOP_LOG.md` (677KB) + `docs/LOOP_LOG.md` (621KB) were token bloat.

## Scope
- **In:** agent scripts, env bootstrap, orientation docs, `.aiignore`, fix `context:check`, delete LOOP_LOG + dereference it.
- **Out:** product features, live gates, test-suite trimming.

## Likely files
`scripts/agent/*.sh`, `scripts/context-budget-check.ts`, `scripts/agent-brief.ts`, `codex-skynet-max.ps1`,
`AGENTS.md`, `GOAL.md`, `ROADMAP.md`, `docs/ai/REPO_MAP.md`, `.aiignore`, `SUMMARY.codex.md`, `BLOCKERS.codex.md`,
`docs/{NEXT_PROMPTS,TESTING,CURRENT_STATE_MATRIX,LOCAL_GATE,AGENT-LOOP}.md`.

## Steps
1. Add `scripts/agent/{_common,bootstrap,doctor,check,test,lint,typecheck,format,status}.sh` delegating to npm scripts.
2. `bootstrap.sh` copies `.env.example`→`.env`, installs deps, generates Prisma client.
3. Make `context:check` + `agent:brief` tolerant of removed history files; drop the LOOP_LOG requirement.
4. Delete `LOOP_LOG.md`; dereference it across docs + `codex-skynet-max.ps1`.
5. Write `GOAL.md`, `ROADMAP.md`, `docs/ai/REPO_MAP.md`, `.aiignore`; refresh `AGENTS.md`.

## Acceptance criteria
- [x] `bash scripts/agent/doctor.sh` and `status.sh` run.
- [x] `bash scripts/agent/bootstrap.sh` creates `.env`; `npm run db:validate` passes standalone.
- [x] `npm run context:check` passes with no `LOOP_LOG.md` present.
- [x] No live (non-historical) reference to `LOOP_LOG.md` remains.
- [x] `npm run lint` and `npm run typecheck` clean after script edits.

## Commands
`bash scripts/agent/bootstrap.sh`, `npm run context:check`, `npm run lint`, `npm run typecheck`, `npm run validate`

## Risks
Editing gate-adjacent scripts. Mitigated: `context-budget-check.ts`/`agent-brief.ts` are not integrity-pinned (only AXIOMS + 3 `.ps1` are).

## Notes
`.env` is gitignored (no secret committed). Root + `docs/` LOOP_LOG removed as working-tree deletions (reversible via `git checkout`).
