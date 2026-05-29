# Codex Blockers

Run number: 824

- No blocker. ULTRAPLAN Phase A is complete (A1 + A2 + A3). The `/settings` consolidation (33 -> 10) was done with the e2e demo tour decoupled to derive from the inventory, so it is correct-by-construction; the page<->inventory bijection, freeze allowlist, build, typecheck, lint, and all gate scripts pass locally.
- `test:e2e:smoke` / `test:e2e:demo` / `db:migrate` / `demo:seed` need Postgres (+ Chromium) — "not run" here, verified by CI on PR #1. This is the only `npm run validate` step not exercised locally.
- Dead code remains: ~20 per-area projection functions + route-list consts + checkpoint/workflow/integration definitions in `lib/operations/operator-surfaces.ts`, plus orphaned `lib/operations/*-operations.ts` modules + tests for deleted surfaces. They are uncalled (exported, so not lint-flagged) and harmless; TICKET016 removes them. Not a blocker.
- Historical blocker notes live in `git log`; keep this file current-only.
