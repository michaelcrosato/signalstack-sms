# Agent Instructions

Canonical instructions for autonomous coding agents in this repo. Tool-specific files
(`.cursor/rules/max-yolo.mdc`) are thin pointers here.

Governing implementation contract: `docs/CANONICAL_IMPLEMENTATION_PLAN.md`.
Loop doctrine (how to think): `docs/AXIOMS.md` + `docs/AGENT-LOOP.md`.
Orientation: `GOAL.md`, `docs/ai/REPO_MAP.md`, `ROADMAP.md`.

## Read-first order

1. `GOAL.md` — what this repo is and what "done" means.
2. `docs/AXIOMS.md` and `docs/AGENT-LOOP.md` — operating doctrine and the loop.
3. `npm run agent:brief` (or `bash scripts/agent/status.sh`) — current git state, handoffs, advisories.
4. `PLAN.md` + `docs/CURRENT_STATE_MATRIX.md` — current roadmap and per-area reality.
5. `docs/ai/REPO_MAP.md` — where code/tests/config live and what to skip.
6. `tickets/` — pick one unblocked ticket.
7. `contracts/**` and `docs/CANONICAL_IMPLEMENTATION_PLAN.md` — targeted reads only.

## The loop (repeat unprompted)

1. **Status** — `bash scripts/agent/status.sh`; read `GOAL.md`, `ROADMAP.md`, `docs/ai/REPO_MAP.md`, top ticket.
2. **Pick** one unblocked, small ticket from `tickets/`; mark it In Progress.
3. **Change** — make the smallest coherent edit. Contracts before feature code.
4. **Check** — targeted first (`scripts/agent/test.sh <file>`, `typecheck.sh`, `lint.sh`), then broad (`scripts/agent/check.sh` = `npm run validate`).
5. **Update** docs + the ticket; file follow-up tickets for anything discovered.
6. **Summarize** in `SUMMARY.codex.md` / `BLOCKERS.codex.md` (keep current-only; `npm run context:check` enforces budgets).

Full doctrine, exhaustion rule, and artifact shape: `docs/AGENT-LOOP.md`. Run history lives in `git log` (there is no LOOP_LOG).

## Command reference

Shell wrappers (`bash scripts/agent/<name>.sh`) delegate to the npm scripts below:

| Task | Shell wrapper | npm script |
| --- | --- | --- |
| One-time setup (env, deps, prisma) | `bootstrap.sh` | `npm run setup` (+ `.env` copy) |
| Env diagnostics (read-only) | `doctor.sh` | — |
| Full local gate | `check.sh` | `npm run validate` |
| Unit tests (vitest) | `test.sh [file]` | `npm test` |
| Lint | `lint.sh` | `npm run lint` |
| Type check | `typecheck.sh` | `npm run typecheck` |
| Format | `format.sh` | (none configured; skips) |
| Startup brief | `status.sh` | `npm run agent:brief` |

DB: `npm run db:generate | db:validate | db:migrate | db:seed`. Demo seed: `npm run demo:seed`.
Domain gates (all inside `validate`): `contracts:check`, `secrets:scan`, `compliance:check`,
`production:gate`, `production-auth:check`, `production-worker:check`, `observability:check`,
`operator:check`, `platform:check`, `context:check`.
E2E: `npm run test:e2e:smoke | test:e2e:demo | test:e2e:product-demo` (needs Postgres + `npx playwright install chromium`).

## Conventions

- **Tenant isolation**: every tenant-scoped row/query carries `orgId` (see `docs/DATA_MODEL.md`). Repos derive it from `requireCurrentOrg()` or take it explicitly.
- **Zod at every boundary**: API, webhooks, CSV, AI, queue payloads validate via `lib/validation/**`.
- **Contracts first**: change `contracts/CONTRACT-*.md` + schemas + tests before feature code; run `npm run contracts:check`.
- **Demo-safe by default**: `MESSAGING_PROVIDER=dummy`, `AI_PROVIDER=fake`, live flags off.
- Path alias `@/*` maps to repo root. App Router under `app/`, domain logic under `lib/`.

## Autonomous vs. ask

Proceed without asking for routine implementation. **Never bypass these hard gates** — they require a human:
live SMS/MMS, live billing (Stripe), live AI provider, real secrets/credentials, destructive or
production DB operations, production worker execution, Clerk/production auth enablement, anything with
real financial cost or external-recipient impact. When blocked, record it in `BLOCKERS.codex.md` and pivot.
Gate scripts and `docs/AXIOMS.md` are integrity-pinned (`scripts/gate-integrity-manifest.json`); only a human edits them.

## Token efficiency

- Start with `scripts/agent/status.sh`, not wholesale file loads.
- Respect `.aiignore` (node_modules, `.next`, `codex-runs/`, lockfile, build caches).
- Read big files with targeted `rg`: `tests/unit/auth/api-route-authorization.test.ts`, `tests/unit/queue/live-worker-controls.test.ts`, `contracts/CONTRACT-TESTING.md`, `docs/CANONICAL_IMPLEMENTATION_PLAN.md`.
- Keep `SUMMARY.codex.md`/`BLOCKERS.codex.md` current-only; history is in `git log`.

## Done

`npm run validate` attempted and green (or every failure explained + ticketed). Docs and the worked
ticket updated. Follow-ups filed. Never claim a check passed unless it ran and passed; record
unavailable gates (e.g. e2e needing Postgres) as "not run", not "passed".

## Milestone rule

Start from `docs/CANONICAL_IMPLEMENTATION_PLAN.md` milestone posture. Preserve hard gates for live
messaging, billing, secrets, destructive production DB ops, and compliance-sensitive actions.

## Cursor Cloud specific instructions

### Backing services (Postgres)

- **Docker Compose** (`docker compose up -d postgres`) is the documented path when Docker is available.
- On Cloud VMs **without Docker**, install and start system Postgres 16 instead, then create the app role/database to match `.env.example`:
  - `CREATE USER signalstack WITH PASSWORD 'signalstack' CREATEDB CREATEROLE;`
  - `CREATE DATABASE signalstack_sms OWNER signalstack;`
  - `CREATEROLE` is required for migration `20260529130000_tenant_rls` (creates `app_rls`).
- Start: `sudo pg_ctlcluster 16 main start` (or `sudo service postgresql start`).
- Apply schema with `npm run db:deploy` (non-interactive). Use `npm run demo:seed` after migrations.
- Redis is optional unless `QUEUE_BACKEND=bullmq`.

### Dev server vs. production build

- Product dev: `npm run dev` → `http://127.0.0.1:3000` (demo session; no Clerk).
- **Do not run `npm run build` while `npm run dev` is running** — it corrupts `.next` and API routes return 500 until you remove `.next` and restart dev (or use `npm start` on a dedicated build).
- E2E (`npm run test:e2e:*`) starts its own Next server on port **3100** via Playwright; needs Postgres + `npx playwright install chromium`.

### Quick verification

| Check | Command |
| --- | --- |
| Health | `curl -sf http://127.0.0.1:3000/api/health` |
| Unit gate | `npm test`, `npm run lint`, `npm run typecheck` |
| Full gate | `npm run validate` (includes e2e smoke when Postgres + Playwright are present) |
| Core API flow | CSV import → `POST /api/campaigns` → preflight (see `e2e/demo-path.spec.ts`) |

### Long-running processes

Use a dedicated tmux session for `npm run dev` (e.g. `next-dev-server`). Optional: `npm run worker:watch` for scheduled campaign sends via the dummy provider.
