# Codex Blockers

Run number: 823

- A3 reduction (33 -> ~8 /settings pages) is BLOCKED on CI verification: `grep e2e/*.spec.ts` proves the operations-coverage specs reference all 33 `/settings` pages, so deleting any breaks an e2e assertion. e2e is unrunnable here (needs Postgres + Chromium), so the deletion cannot be verified locally without silently risking the investor/operations demo. The "freeze new ones" half is done (settings-surface-allowlist.test.ts). The reduction needs a CI-gated iteration updating pages + inventory + per-surface tests + e2e specs together — TICKET008. This is a verification limit, not a code defect.
- Environment: `test:e2e:smoke`, `db:migrate`, `demo:seed` need Postgres (+ Chromium) — "not run", verified by CI. Tracked in TICKET002.
- This run edits two test files, one contract doc, and handoff docs only; no route handlers, gate scripts, hard gates, secrets, providers, billing, or production paths touched.
- Historical blocker notes live in `git log`; keep this file current-only.
