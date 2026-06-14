# TICKET007 — Collapse live-worker-controls permutation tests

- **Status:** Done (2026-05-28)
- **Priority:** P1 (ULTRAPLAN Phase A / A1)

## Result
11,715 LOC / 229 tests → 222 LOC / 33 tests. Full suite 795 → 599, all green. `production-worker:check`,
`typecheck`, `lint`, `context:check` pass. SUT + gate unchanged; the gate's 8 required policy strings are
preserved as test names. e2e not run (needs Postgres). Follow-up: TICKET006 (auth test), TICKET014 (doc prose trim).

## Goal
Replace the 11,715-LOC `tests/unit/queue/live-worker-controls.test.ts` (229 syntactic proxy/reflection
permutations of an unimplemented, reserved feature) with a focused table-driven suite that preserves
every REAL invariant. Target: < ~300 LOC, equal-or-better guarantee coverage, gate green.

## Context
`lib/queue/live-worker-controls.ts` (469 LOC, unchanged) gates the reserved `production-live-campaign`
worker class. Security property: `liveWorkerDeploymentClassIsAuthorized` returns `false` while the 11
controls are all `"planned"`, and rejects every malformed/hostile input; it authorizes only a frozen,
exact-shape, all-`"implemented"` controls array. The old test brute-forced this with ~180 proxy/Symbol
permutations — disproportionate for a feature that doesn't exist. SUT + gate (`production-worker-policy-check.ts`)
are not touched, so `npm run validate` stays green.

## Scope
- **In:** rewrite the one test file; keep coverage of metadata shape, each predicate, `…AreImplemented`, the authorization gate (deny + positive path), and `worker.ts` deployment-class allowance.
- **Out:** changing the SUT, the gate script, or the reserved-class blocked posture.

## Likely files
`tests/unit/queue/live-worker-controls.test.ts` (rewrite), `docs/TESTING.md`, `docs/CURRENT_STATE_MATRIX.md`, `SUMMARY.codex.md`.

## Steps
1. Read SUT + worker exports (done): `liveWorkerControls*`, `liveWorkerDeploymentClassIsAuthorized`, `supportedWorkerDeploymentClasses`, `workerDeploymentClassIsAllowed`.
2. Write focused suite: metadata; predicates true on real checklist; `…AreImplemented()` false / implemented true; `…IsAuthorized` deny-table + positive path; worker class allow/deny.
3. `bash scripts/agent/test.sh tests/unit/queue/live-worker-controls.test.ts`; `typecheck`; `lint`.
4. `npm run validate` (incl. `production-worker:check`, `context:check`).
5. Trim `docs/TESTING.md` permutation prose; update matrix + summary.

## Acceptance criteria
- [ ] File < ~300 LOC; all new tests pass.
- [ ] Reserved class blocked: `liveWorkerDeploymentClassIsAuthorized()` and real-checklist wrapper → false.
- [ ] Positive path covered: implemented frozen wrapper → true.
- [ ] `workerDeploymentClassIsAllowed` allows unset/""/local-demo, denies production-live-campaign.
- [ ] `npm run validate` green (or failures explained + ticketed).

## Commands
`bash scripts/agent/test.sh tests/unit/queue/live-worker-controls.test.ts`, `npm run typecheck`, `npm run lint`, `npm run validate`

## Risks
Dropping a real edge case. Mitigated: the SUT denies-by-default; the table covers each rejection branch + the positive branch. SUT/gate unchanged.

## Notes
Sibling ticket TICKET006 does the same for `api-route-authorization.test.ts` (11,014 LOC).
