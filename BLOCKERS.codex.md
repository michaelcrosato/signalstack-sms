# Codex Blockers

Run number: 820

- No blocker from collapsing the live-worker-controls permutation test. SUT and the production-worker policy gate are unchanged; the reserved `production-live-campaign` class remains blocked.
- Environment: `test:e2e:smoke`, `db:migrate`, and `demo:seed` need a running Postgres (and Chromium for e2e), unavailable in this sandbox — recorded as "not run", verified by CI. Tracked in TICKET002.
- The change edits one test file plus handoff docs only; it did not touch the SUT, gate scripts, hard gates, secrets, providers, billing, or production paths.
- Historical blocker notes live in `git log`; keep this file current-only to avoid recursive handoff bloat.
