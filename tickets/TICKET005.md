# TICKET005 — Regression test: context:check tolerates removed history files

- **Status:** Done (2026-05-30)
- **Priority:** P2

## Goal
Add a unit test so `npm run context:check` can never again hard-crash when an optional append-only
history file (e.g. a future `LOOP_LOG.md`) is absent — the bug fixed in TICKET001.

## Context
`scripts/context-budget-check.ts` previously did `readFileSync("docs/LOOP_LOG.md")` unconditionally and
crashed with ENOENT once that file was deleted, turning the whole `validate` gate red. The fix removed the
hard requirement; a regression test should pin the new behavior. The script is currently a top-level
side-effecting module, so light refactoring is needed to make it testable.

## Scope
- **In:** export a pure `runContextBudgetCheck(): string[]` (failures) from the script; add a vitest covering present + absent optional files; keep CLI behavior identical.
- **Out:** changing budget thresholds or required markers.

## Likely files
`scripts/context-budget-check.ts`, `tests/unit/deployment/` (new `context-budget-check.test.ts`), `package.json` (unchanged).

## Steps
1. Refactor `scripts/context-budget-check.ts` to export a function returning the failures array; keep the `if (failures.length) process.exit(1)` CLI wrapper guarded by a main-module check.
2. Add `tests/unit/deployment/context-budget-check.test.ts`: asserts no throw + no failures for current repo state, and that a missing optional history file does not produce a failure.
3. `npm run typecheck`, `npm run lint`, `npm test -- context-budget-check`.

## Acceptance criteria
- [ ] `context-budget-check.ts` exports a testable function; `npm run context:check` behavior unchanged (still exits non-zero on real budget violations).
- [ ] New test passes and fails if the unconditional-read regression is reintroduced.
- [ ] `npm run validate` green.

## Commands
`bash scripts/agent/test.sh tests/unit/deployment/context-budget-check.test.ts`, `npm run context:check`, `npm run validate`

## Risks
Don't change the CLI exit contract — CI/`local-gate.ps1` depend on non-zero exit on violation.

## Notes
Mirrors the existing `tests/unit/deployment/workflow-local-gate.test.ts` style.
