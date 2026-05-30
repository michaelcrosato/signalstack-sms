# TICKET002 — Verify full local gate incl. e2e against real Postgres

- **Status:** Done (2026-05-30)
- **Priority:** P1

## Goal
Confirm the complete `npm run validate` is green end-to-end, including `test:e2e:smoke` (the one step
unverified in this environment because it needs Postgres + Playwright browsers).

## Context
All `validate` steps pass except `test:e2e:smoke` (and `db:migrate`/`db:seed`), which require a running
Postgres and installed Chromium. Build, lint, typecheck, vitest (795), and all domain gates pass.

## Scope
- **In:** stand up local Postgres (docker-compose), migrate, seed, install browsers, run smoke + product-demo e2e, fix demo-path breakages.
- **Out:** live providers, production deploy, new product features.

## Likely files
`docker-compose.yml`, `prisma/migrations/**`, `prisma/seed.ts`, `playwright.config.ts`,
`e2e/{smoke,demo-path,product-demo-path}.spec.ts`, `docs/LOCAL_GATE.md`.

## Steps
1. `docker compose up -d` (or local Postgres); export `DATABASE_URL`.
2. `npm run db:migrate && npm run demo:seed`.
3. `npx playwright install chromium`.
4. `npm run test:e2e:smoke` then `npm run test:e2e:product-demo`.
5. `npm run validate` (full). Fix any demo-path regression; update `docs/CURRENT_STATE_MATRIX.md`.

## Acceptance criteria
- [ ] `npm run db:migrate` and `npm run demo:seed` succeed against local Postgres.
- [ ] `npm run test:e2e:smoke` passes.
- [ ] `npm run test:e2e:product-demo` passes.
- [ ] Full `npm run validate` exits 0; result recorded in `SUMMARY.codex.md`.

## Commands
`docker compose up -d`, `npm run db:migrate`, `npm run demo:seed`, `npx playwright install chromium`, `npm run validate`

## Risks
Seed/migration drift; port 3100 conflicts (set `PLAYWRIGHT_PORT`). No live external impact — dummy provider only.

## Notes
If Postgres is unavailable in the sandbox, record e2e as "not run (needs Postgres)" — do not claim it passed.
