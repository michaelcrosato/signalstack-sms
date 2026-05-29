# Codex Blockers

Run number: 828

- **db:generate Windows EPERM — MITIGATED.** `db:generate` now runs `scripts/db-generate.ts`, which retries
  the Prisma engine-DLL rename through the transient Defender/AV lock. `npm run validate` / `local-gate.ps1`
  now pass end-to-end on Windows with no manual workaround.
- **Human-gated (out of scope for unattended/AFK runs):** live SMS/MMS, live billing (Stripe), live AI
  keys+cost, Clerk/prod-auth enablement, RLS production enablement (point the app at a non-superuser DB role
  + adopt `withTenantRls` on request paths), destructive/prod DB ops. The AFK queue (SPEC-011..015) is all
  demo-safe and needs none of these.
- **SPEC-002 CI run still pending** a real GitHub Actions trigger (the local path is green; workflows mirror it).
- Docker `postgres`+`redis` run with `restart: unless-stopped` so they survive the 12h loop.
- Current-only; history in `git log`.
