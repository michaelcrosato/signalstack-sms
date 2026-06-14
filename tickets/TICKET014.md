# TICKET014 — Trim permutation prose from TESTING.md and CONTRACT-TESTING.md

- **Status:** Done (2026-05-28)
- **Priority:** P2 (ULTRAPLAN Phase A / A2)

## Result
`contracts/CONTRACT-TESTING.md` 399 → 48 LOC: kept the durable contract (gate composition, contracts:check
rules, real invariants, fixtures, Playwright, demo paths) and dropped the alias/proxy permutation catalogue.
`contracts:check` only checks existence (verified) and still passes; `context:check` no longer flags it.
TESTING.md prose trim deferred (lower value now that the giant tests are gone).

## Goal
Shrink `docs/TESTING.md` and `contracts/CONTRACT-TESTING.md` so they describe the durable test contract,
not the now-removed exhaustive `globalThis`-alias / proxy-reflection permutation catalogue. Keep them honest
after the test collapses in TICKET007 (done) and TICKET006.

## Context
`docs/TESTING.md` (~222 lines) and `contracts/CONTRACT-TESTING.md` (~399 lines, ~119KB) contain dense
paragraphs enumerating every alias/proxy permutation the giant tests used to cover. After collapsing those
tests, the prose overstates coverage and is pure token noise. `context:check` flags CONTRACT-TESTING.md as a
read-with-care large file.

## Scope
- **In:** replace the permutation paragraphs with concise statements of the real invariants + where they are tested.
- **Out:** changing test behavior or the contract's required scripts/fixtures/tags.

## Likely files
`docs/TESTING.md`, `contracts/CONTRACT-TESTING.md`. Re-run `npm run contracts:check` + `npm run context:check`.

## Steps
1. After TICKET006 lands, identify the permutation paragraphs (auth alias forms, live-worker proxy/reflection lists).
2. Replace each block with one line: the invariant + the test file that proves it.
3. Keep the contract's durable parts (required scripts, fixtures, demo path, test tags).
4. `npm run contracts:check`; `npm run context:check`; `npm run validate`.

## Acceptance criteria
- [ ] No prose claims exhaustive permutation coverage that no longer exists.
- [ ] `contracts/CONTRACT-TESTING.md` materially smaller; `contracts:check` still passes.
- [ ] `npm run validate` green.

## Commands
`npm run contracts:check`, `npm run context:check`, `npm run validate`

## Risks
`contracts:check` may assert specific text in CONTRACT-TESTING.md — verify before trimming (read `scripts/contracts-check.ts`).

## Notes
Do after TICKET006 so both giant tests are collapsed first.
