# SPEC-002 — Give CI a Postgres + Redis service so the gate truly verifies

- **Status:** Done; CI-run pending (2026-05-28) — added postgres+redis services + `db:deploy` + `demo:seed` to `ci.yml` & `premerge.yml`. The exact path was **verified locally**: `docker compose up postgres redis` → `db:deploy` (14 migrations) → `demo:seed` → `test:e2e:smoke` **passed** against the live DB. A GitHub Actions run can't be triggered from this sandbox; confirm green on next PR. · **Priority:** P1 · **Pillar:** Infra/CI · **Effort:** S

## Description
`.github/workflows/ci.yml` (and `premerge.yml`) set `DATABASE_URL=...localhost:5432` but declare **no
`services:` block**. `local-gate.ps1` → `npm run validate` includes `test:e2e:smoke`, which needs a real
Postgres (and the app may need Redis for queue paths). So CI almost certainly cannot pass the e2e step —
the "verified by CI" claim in handoffs is UNCERTAIN/likely false. Make CI provision the same backing
services `docker-compose.yml` provides locally, and run migrate+seed before the gate.

## Prereqs / deps
None structurally. Mirrors `docker-compose.yml`. DAG-independent (Phase 0).

## Implementation approach
1. In `ci.yml` (and `premerge.yml`) add `services: postgres: {image: postgres:16-alpine, env, ports 5432,
   options: --health-cmd pg_isready ...}` and `redis: {image: redis:7.4-alpine, ports 6379, health}`.
2. Add `REDIS_URL` to job env; keep existing demo-safe env.
3. Before the gate, add steps: `npm run db:deploy` (migrate deploy) then `npm run demo:seed`.
4. Keep `pwsh ./scripts/local-gate.ps1` as the gate entry (it asserts integrity then runs validate).

## Acceptance criteria
- [ ] `ci.yml` declares healthy `postgres` + `redis` services; `REDIS_URL` set.
- [ ] migrate + seed run before `local-gate.ps1`.
- [ ] A CI run is green **including `test:e2e:smoke`** (verify on a PR; if not triggerable from sandbox,
      mark "CI-pending" and leave the workflow change reviewed).
- [ ] `premerge.yml` updated consistently.
- [ ] No secrets added; demo-safe env preserved.

## Test strategy
Open a PR and inspect GitHub Actions (human/CI confirms). Locally optional: `act` or run the same steps
against `docker-compose up postgres redis`. Honesty: GitHub Actions cannot run from this sandbox → record
as CI-pending with the diff reviewed.

## Out of scope
Build caching of Prisma engines, OS/Node matrix, deploy jobs, branch-protection policy (`automerge.yml`).
