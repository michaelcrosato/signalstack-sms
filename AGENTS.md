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

Shell wrappers delegate to the npm scripts below. Both POSIX Bash (`scripts/agent/<name>.sh`) and Windows PowerShell (`pwsh scripts/agent/<name>.ps1`) variants are supported:

| Task | Bash wrapper | PowerShell wrapper | npm script |
| --- | --- | --- | --- |
| One-time setup (env, deps, prisma) | `bootstrap.sh` | `bootstrap.ps1` | `npm run setup` (+ `.env` copy) |
| AFK bootstrap alias | `bootstrap.sh` | `bootstrap.ps1` | `npm run agent:bootstrap` |
| Env diagnostics (read-only) | `doctor.sh` | `doctor.ps1` | `npm run agent:doctor` |
| Full local gate | `check.sh` | `check.ps1` | `npm run validate` |
| AFK local gate alias | `check.sh` | `check.ps1` | `npm run agent:check` |
| Unit tests (vitest) | `test.sh [file]` | `test.ps1 [file]` | `npm test` |
| AFK unit-test alias | `test.sh [file]` | `test.ps1 [file]` | `npm run agent:test [file]` |
| Lint | `lint.sh` | `lint.ps1` | `npm run lint` |
| AFK lint alias | `lint.sh` | `lint.ps1` | `npm run agent:lint` |
| Type check | `typecheck.sh` | `typecheck.ps1` | `npm run typecheck` |
| AFK typecheck alias | `typecheck.sh` | `typecheck.ps1` | `npm run agent:typecheck` |
| Format | `format.sh` | `format.ps1` | (none configured; skips) |
| AFK format alias | `format.sh` | `format.ps1` | `npm run agent:format` |
| Startup brief | `status.sh` | `status.ps1` | `npm run agent:brief` |


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
