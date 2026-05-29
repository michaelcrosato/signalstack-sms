# Codex Blockers

Run number: 822

- No blocker from collapsing the operator-surfaces test or trimming CONTRACT-TESTING.md. The inventory SUT and the page↔inventory bijection guarantee are unchanged; `contracts:check` still passes.
- A3 (consolidate /settings ops pages 33 -> ~8) is NOT a clean autonomous delete: the investor-demo e2e path visits `/settings/{demo,reports,workflows,releases,operations}`, which are outside the proposed ~8 release-safety keep-set, and e2e is not runnable here (needs Postgres + Chromium). Deleting pages also requires updating `lib/operations/operator-surfaces.ts`, the bijection test, nav, and e2e specs together. Scoped to TICKET008 for a CI-verified iteration; not done blindly to avoid silently breaking the demo.
- Environment: `test:e2e:smoke`, `db:migrate`, `demo:seed` need Postgres (+ Chromium) — "not run", verified by CI. Tracked in TICKET002.
- This run edits two test files, one contract doc, and handoff docs only; no route handlers, gate scripts, hard gates, secrets, providers, billing, or production paths touched.
- Historical blocker notes live in `git log`; keep this file current-only.
