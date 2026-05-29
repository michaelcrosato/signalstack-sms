# TICKET006 — Collapse api-route-authorization permutation tests

- **Status:** Todo
- **Priority:** P1 (ULTRAPLAN Phase A / A1)

## Goal
Replace the 11,014-LOC `tests/unit/auth/api-route-authorization.test.ts` (syntactic `globalThis`-alias /
body-reader permutations) with a focused, table-driven suite asserting the REAL invariant: every mutating
`app/api/**/route.ts` handler calls `requireApiRole` before any request body is read. Target < ~400 LOC,
equal-or-better real coverage, gate green. Mirrors the completed TICKET007.

## Context
This file is the largest remaining test (after TICKET007). It brute-forces hundreds of `globalThis`/`Request`/
`Object`/`Reflect` alias spellings to prove the role check precedes body parsing. The invariant is one rule;
a representative set of alias forms + the real route scan covers it. Confirm which exported scanner/helper in
`lib/auth/**` it exercises, and whether a gate (like `production-worker-policy-check.ts`) requires specific
test-name strings — preserve those (see TICKET007 for that pattern).

## Scope
- **In:** rewrite the one test file to table-driven representative cases; keep the per-route reverse-coverage assertion.
- **Out:** changing `lib/auth/**`, the RBAC matrix, or route handlers.

## Likely files
`tests/unit/auth/api-route-authorization.test.ts` (rewrite), `lib/auth/api-authorization.ts`, `lib/auth/api-rbac-matrix.ts`, possibly a gate script that greps it, `docs/TESTING.md`.

## Steps
1. Read the SUT scanner + any gate that requires strings from this test file.
2. Identify the distinct REAL invariants (role-before-body; reverse coverage of all mutating routes; signed-webhook exceptions).
3. Write a representative table (a handful of alias forms, not hundreds) + the full route reverse-coverage scan.
4. `bash scripts/agent/test.sh tests/unit/auth/api-route-authorization.test.ts`; `typecheck`; `lint`; `npm run validate`.
5. Update docs (TICKET014 trims the prose).

## Acceptance criteria
- [ ] File < ~400 LOC; all tests pass; total test LOC now < ~14k (ULTRAPLAN Phase A exit metric).
- [ ] Every mutating route still asserted to call `requireApiRole` before body parsing.
- [ ] Any gate-required test-name strings preserved; `npm run validate` green.

## Commands
`wc -l tests/unit/auth/api-route-authorization.test.ts`, `bash scripts/agent/test.sh tests/unit/auth/api-route-authorization.test.ts`, `npm run validate`

## Risks
Dropping a real bypass case. Mitigate: keep the full per-route reverse-coverage scan (the actual guarantee) plus representative alias forms; the SUT is unchanged.

## Notes
After this, total test LOC should fall below the ULTRAPLAN Phase A exit threshold (~14k).
