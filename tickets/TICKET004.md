# TICKET004 — Keep repo-map and state matrix current

- **Status:** Done (2026-06-12)
- **Priority:** P3

## Goal
Keep `docs/ai/REPO_MAP.md` and `docs/CURRENT_STATE_MATRIX.md` accurate so agents stay oriented in minutes.

## Context
Both drift as code changes. REPO_MAP lists where logic/tests/config live + what to skip; the matrix is
the per-area reality check. Stale orientation docs are the top cause of wasted agent loops.

## Scope
- **In:** reconcile both docs with the actual tree + gate set after notable changes.
- **Out:** rewriting the canonical plan or contracts.

## Likely files
`docs/ai/REPO_MAP.md`, `docs/CURRENT_STATE_MATRIX.md`, `AGENTS.md`, `GOAL.md`.

## Steps
1. Diff `lib/` and `app/api/**` against REPO_MAP domain tables; update added/removed modules.
2. Update the matrix row(s) for any area whose backend/browser state or "Main Gap" changed.
3. Re-check `.aiignore` + REPO_MAP "skip / read-with-care" lists against current large files.
4. Run `npm run context:check` (keeps the matrix within budget).

## Acceptance criteria
- [ ] REPO_MAP domain tables match the current `lib/` + `app/` layout.
- [ ] Changed areas reflected in `docs/CURRENT_STATE_MATRIX.md`.
- [ ] Large-file advisory list still accurate (sizes/paths).
- [ ] `npm run context:check` passes.

## Commands
`npm run context:check`, `bash scripts/agent/status.sh`

## Risks
Low. Keep the matrix compact (24KB budget) — summarize, don't append run logs.

## Notes
Run opportunistically at the end of any ticket that adds/removes modules or gates.
