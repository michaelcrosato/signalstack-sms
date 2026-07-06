# Codex Blockers

Run number: 830

- **No repo-cleanup blockers in the current pass.** `npm run validate` completed green on
  `chore/agent-cleaner`. Note: unit tests and e2e need Postgres/Redis reachable on `localhost`
  (`docker compose up -d postgres redis` with Docker Desktop running).
- **Human-gated (out of scope for unattended/AFK runs):** live SMS/MMS, live billing (Stripe), live AI
  keys+cost, Clerk/prod-auth enablement, RLS production enablement (point the app at a non-superuser DB role
  + adopt `withTenantRls` on request paths), destructive/prod DB ops.
- **SPEC-002 CI run still pending** a real GitHub Actions trigger (the local path is green; workflows mirror it).
- Current-only; history in `git log`.
