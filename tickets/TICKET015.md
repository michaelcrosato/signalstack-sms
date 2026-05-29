# TICKET015 — Collapse operator-surfaces permutation test

- **Status:** Done (2026-05-28)
- **Priority:** P1 (ULTRAPLAN Phase A / debt paydown)

## Goal
Collapse `tests/unit/operations/operator-surfaces.test.ts` (the largest remaining test) to a table-driven
suite preserving the real invariants, to clear the Phase A "test LOC < ~14k" exit metric.

## Result
2,371 LOC / 67 tests → 203 LOC / 40 tests. Kept: the two filesystem-bijection guarantees (inventory route →
page exists; local operator page → listed in inventory), frozen-inventory checks, a table-driven projection
check over all 32 link accessors (frozen, deduped, inventory-backed, page exists), structured-projection
checks (checkpoints/steps/areas), summary freshness, and representative malformed-inventory rejection.
Dropped ~25 malformed-inventory permutations + ~20 near-duplicate per-area projection tests.

SUT `lib/operations/operator-surfaces.ts` unchanged; no gate requires strings from this file. Full suite
509 → 482, all green; typecheck, lint, contracts:check, context:check pass. Total test LOC 14,641 → 12,473.

## Acceptance criteria
- [x] File < ~300 LOC; all tests pass.
- [x] Page↔inventory bijection preserved (the real guarantee).
- [x] Every link projection asserted frozen, inventory-backed, and pointing at a real page.
- [x] Total test LOC < ~14k; `npm run validate` runnable steps green (e2e needs Postgres).

## Notes
The bijection test will auto-track A3 (TICKET008): when ops pages + inventory are consolidated together, this
test stays green by construction.
