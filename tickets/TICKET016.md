# TICKET016 — Remove dead operator-surface code for consolidated pages

- **Status:** Todo
- **Priority:** P3 (ULTRAPLAN Phase A cleanup)

## Goal
Delete the now-dead per-area projection functions, route-list constants, and orphaned `lib/operations`
modules + tests left behind when the `/settings` surface was consolidated 33 -> 10 (TICKET008).

## Context
TICKET008 reduced the inventory and deleted 23 ops pages but, to keep the change atomic and locally
verifiable, left the removed surfaces' projection functions (`getContactOperationLinks`,
`getCampaignOperationLinks`, `getReportingIndexLinks`, `getWorkflowOperationSteps`,
`getIntegrationOperationAreas`, `getSystemOperationLinks`, `getUsageOperationLinks`, etc.) and their
route-list consts in `lib/operations/operator-surfaces.ts`. They are exported but uncalled (so not
lint-flagged) and would throw if invoked (their routes are no longer in the inventory). The
`lib/operations/*-operations.ts` modules + `tests/unit/operations/*-operations.test.ts` for deleted
surfaces are likewise orphaned (testing data for pages that no longer exist).

## Scope
- **In:** delete dead exports + route-list consts in `operator-surfaces.ts`; delete orphaned
  `lib/operations/<area>.ts` modules + their tests for removed surfaces; remove dead imports.
- **Out:** changing the kept surfaces, the inventory, or the bijection/freeze tests.

## Likely files
`lib/operations/operator-surfaces.ts`, `lib/operations/{api,contract,delivery,notification,queue,...}-operations.ts` (orphaned ones), `tests/unit/operations/*.test.ts` (orphaned ones).

## Steps
1. List exported projections in `operator-surfaces.ts` not referenced by any kept page or test (grep).
2. Delete those functions + their route-list consts + checkpoint/workflow/integration definitions.
3. Delete orphaned `lib/operations/*-operations.ts` + their tests (confirm no kept page imports them).
4. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run validate`.

## Acceptance criteria
- [ ] No exported operator-surface projection references a removed route.
- [ ] No orphaned operations module/test for a deleted surface remains.
- [ ] `npm run validate` green (e2e via CI).

## Risks
Low — deleting uncalled code. Verify each removal isn't imported by a kept page/test before deleting.

## Notes
Reduces `operator-surfaces.ts` (currently ~870 LOC) substantially; further trims test/lib LOC.
