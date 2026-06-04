# Codex Blockers

Run number: 829

- **No repo-quality blockers in the current pass.** `npm run validate` and `npm audit` both completed
  successfully on `chore/repo-quality-overhaul`.
- **Human-gated (out of scope for unattended/AFK runs):** live SMS/MMS, live billing (Stripe), live AI
  keys+cost, Clerk/prod-auth enablement, RLS production enablement (point the app at a non-superuser DB role
  + adopt `withTenantRls` on request paths), destructive/prod DB ops. The AFK queue (SPEC-011..015) is all
  demo-safe and needs none of these.
- **SPEC-002 CI run still pending** a real GitHub Actions trigger (the local path is green; workflows mirror it).
- Current-only; history in `git log`.
