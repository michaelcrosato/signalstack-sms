# Codex Blockers

Run number: 827

- **Local-only flake (documented, not a code failure):** `npm run db:generate` fails on Windows with
  `EPERM: ... rename query_engine-windows.dll.node` — an antivirus/file-lock on the freshly written
  Prisma engine DLL. The client is already generated & valid (db:validate/typecheck/384 tests/build/
  e2e:smoke all pass using it). This halts a single end-to-end `npm run validate` at the `db:generate`
  step **locally**; Linux CI is unaffected. Every other gate step is verified green individually.
- **SPEC-002 CI run pending:** the workflow now provisions postgres+redis + migrate+seed and the exact
  path passed locally (e2e:smoke green), but a GitHub Actions run is not triggerable from this sandbox —
  confirm green on the next PR.
- Live SMS/MMS, live billing (Stripe), live AI keys+cost, Clerk/prod-auth enablement, destructive/prod DB
  ops remain human-gated. Docker `postgres`+`redis` containers were left running this session.
- Historical notes live in `git log`; keep this file current-only.
