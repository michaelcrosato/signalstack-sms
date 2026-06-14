# TICKET008 — Consolidate /settings operations pages and freeze new ones

- **Status:** Done (2026-05-28)
- **Priority:** P2 (ULTRAPLAN Phase A / A3)

## Result
Consolidated `/settings` 33 -> 10 release-safety surfaces (operations, health, security, validation, queue,
provider, compliance, readiness-audit, exports, runbook) + `/settings` index + `/demo`. Reduced the inventory
to 3 groups/12 links and pruned kept projections' route lists. Decoupled `e2e/demo-path.spec.ts` to derive its
tour from `getSettingsNavigationLinks()` (correct-by-construction). Freeze allowlist updated to the 10-page set.
Verified green locally: typecheck, lint, build, `npm run test` (462), and all gate scripts. e2e via CI.
Dead per-area projections/modules remain for deleted surfaces — cleanup in TICKET016.

## Goal
Reduce the over-built operations surface (33 `/settings` pages vs 9 `/dashboard` product pages) toward the
set that serves release safety, and add a guard so new ops pages are a deliberate decision. Do this without
breaking the investor-demo path.

## Progress
- DONE (run 823): "freeze new ones" — `tests/unit/operations/settings-surface-allowlist.test.ts` pins the
  surface to an explicit 33-entry allowlist; a new `/settings` page fails the gate until added deliberately.
- BLOCKED locally: the reduction (delete pages). Evidence: `grep e2e/*.spec.ts` references ALL 33 `/settings`
  pages, so any deletion breaks an e2e assertion, and e2e needs Postgres + Chromium (unrunnable here). The
  reduction is a CI-gated iteration. When reducing, shrink the allowlist in the freeze test in the same commit.

## Context
The repo is over-indexed on read-only ops pages (own consensus + ULTRAPLAN). Pages render from the shared
inventory `lib/operations/operator-surfaces.ts`; `tests/unit/operations/operator-surfaces.test.ts` enforces a
page↔inventory bijection (so pages and inventory must change together); nav is `components/layout/side-nav.tsx`.

**Critical caveat (do not blind-delete):** the investor-demo e2e specs visit `/settings/{demo,reports,
workflows,releases,operations}` and assert their content (see `e2e/*.spec.ts` + `docs/CURRENT_STATE_MATRIX.md`).
The original "~8 keep-set" (health, validation, security, queue, provider, compliance, usage, runbook) does NOT
include those demo-path pages. So the keep-set must ALSO retain demo-path pages, or the e2e specs must be
updated — and e2e is not runnable locally (needs Postgres + Chromium), so this needs CI verification.

## Scope
- **In:** decide the keep-set (release-safety ∪ demo-path-required); remove the rest from pages + inventory + nav + e2e specs together; add a freeze guard (cap/allowlist) for new `/settings` pages.
- **Out:** changing product `/dashboard` pages; changing the bijection guarantee.

## Likely files
`app/settings/**/page.tsx`, `lib/operations/operator-surfaces.ts`, `tests/unit/operations/*.test.ts`, `components/layout/side-nav.tsx`, `e2e/*.spec.ts`, `docs/CURRENT_STATE_MATRIX.md`.

## Steps
1. Grep `e2e/*.spec.ts` for every `/settings/*` and `/demo` route asserted → that's the demo-path-required set.
2. Define keep-set = release-safety pages ∪ demo-path-required pages; list removals.
3. Remove each removed surface from the inventory AND delete its `page.tsx` AND its per-surface test in the same commit (bijection stays green).
4. Update nav + any demo/operations index that links to removed pages; update e2e specs that visit them.
5. Add a freeze guard (e.g., a test asserting the `/settings` page set equals an explicit allowlist).
6. `npm run validate`; push branch; open PR; have CI run e2e against Postgres before merge.

## Acceptance criteria
- [ ] `/settings` page count materially reduced toward the keep-set; bijection test green.
- [ ] Investor-demo + product-demo e2e still pass **in CI** (record locally as "not run").
- [ ] Freeze guard prevents adding a new `/settings` page without updating the allowlist.
- [ ] `npm run validate` green (e2e via CI).

## Risks
Deleting demo-path pages breaks e2e silently (unverifiable locally) → mitigate by deriving the removal set from actual e2e references and verifying in CI. This is why it is a focused, CI-gated iteration, not a blind purge.

## Notes
TICKET015 already collapsed the inventory test; the bijection there auto-tracks this consolidation.
