# Repo Map

Fast orientation for agents. Read this + `GOAL.md` + `npm run agent:brief`, then targeted reads.
Stack: Next.js App Router + TypeScript (strict) + Prisma/Postgres + BullMQ/Redis (optional). npm.

## Entry points

| What | Where |
| --- | --- |
| Web app (App Router) | `src/app/` — `page.tsx` (marketing), `dashboard/**` (product), `settings/**` (operations), `demo/**` (gated live-test SMS) |
| API route handlers | `src/app/api/**/route.ts` (Zod-validated; RBAC via `src/lib/auth`) |
| Request middleware | `src/middleware.ts` |
| Queue workers (local/demo only) | `workers/index.ts` (DB), `workers/bullmq.ts` (BullMQ) |

## Core logic — `src/lib/`

| Domain | Path | Notes |
| --- | --- | --- |
| DB | `src/lib/db/` | `prisma.ts`, `tenant.ts` (orgId guard), `repositories/**` (tenant-scoped) |
| Validation | `src/lib/validation/` | Zod schemas per domain (boundary contracts) |
| Messaging | `src/lib/messaging/` | `provider/**` adapter (dummy/twilio), `render-template`, `send-preflight`, `twilio-webhooks`, `delivery-*` |
| Queue | `src/lib/queue/` | `worker`, `bullmq*`, `jobs`, `idempotency`, `live-worker-controls` (frozen hard-gate metadata) |
| Compliance | `src/lib/compliance/` | `gates`, `opt-out`, `readiness-audit-export` |
| Auth/RBAC | `src/lib/auth/` | `api-authorization`, `api-rbac-matrix`, `current-org`, `demo-session`, `roles` |
| AI (fake) | `src/lib/ai/` | `fake-ai-provider`, `conversation-context`, `usage` |
| Billing/Analytics/CSV | `src/lib/billing/`, `src/lib/analytics/`, `src/lib/csv/` | local usage metering, overview, contact import |
| Product projections | `src/lib/product/` | UI-facing frozen view models + `*-defaults` for `src/app/dashboard/**` |
| Operations (read-only) | `src/lib/operations/` | inventory backing `src/app/settings/**` |
| Deployment/Env/Rate-limit | `src/lib/deployment/`, `src/lib/env/`, `src/lib/rate-limit/` | `production-gate`, demo-safe `defaults`, in-memory limiter |

## Data model

`prisma/schema.prisma` (entities + enums + indexes), `prisma/migrations/**` (SQL), `prisma/seed.ts` (demo seed). Narrative: `docs/DATA_MODEL.md`. Every tenant row carries `orgId`.

## Tests

- Unit (vitest): `tests/unit/**`, `tests/smoke/`. Run targeted: `bash scripts/agent/test.sh <file>`.
- E2E (Playwright, needs Postgres + browsers): `e2e/smoke.spec.ts`, `e2e/demo-path.spec.ts`, `e2e/product-demo-path.spec.ts`.

## Gates & scripts

- Aggregator: `scripts/validate.ts` (= `npm run validate` = `ci` = `premerge`).
- Domain checks: `scripts/*-check.ts`, `scripts/contracts-check.ts`, `scripts/secrets-scan.ts`, `scripts/production-gate.ts`, etc.
- Agent wrappers: `scripts/agent/*.sh`. Protected PowerShell gate: `scripts/local-gate.ps1` + `scripts/assert-gate-integrity.ps1` (+ `gate-integrity-manifest.json`).
- Contracts: `contracts/CONTRACT-*.md`. Config: `*.config.*`, `tsconfig.json`, `package.json`.

## Source-of-truth docs

`docs/CANONICAL_IMPLEMENTATION_PLAN.md` (governing), `GOAL.md`, `ROADMAP.md`, `PLAN.md`,
`docs/CURRENT_STATE_MATRIX.md` (per-area reality), `docs/{ARCHITECTURE,DATA_MODEL,API_MAP,WEBHOOKS,COMPLIANCE,TESTING}.md`.
Current handoffs: `SUMMARY.codex.md`, `BLOCKERS.codex.md`, `docs/NEXT_PROMPTS.md`.

## Skip / read-with-care

- **Skip** (in `.aiignore`): `node_modules/`, `.next/`, `codex-runs/` (50 stale agent logs), `package-lock.json`, `*.tsbuildinfo`, `test-results/`, `docs/loop-artifacts/`.
- **Targeted `rg` only** (huge): `tests/unit/auth/api-route-authorization.test.ts` (~512KB), `tests/unit/queue/live-worker-controls.test.ts` (~464KB), `contracts/CONTRACT-TESTING.md` (~119KB), `docs/CANONICAL_IMPLEMENTATION_PLAN.md` (~2.7k lines).
- `planning/*-2026-05-21.md` are dated snapshots; read `planning/CONSENSUS-2026-05-21.md` for the summary.
- Run history is in `git log` (there is no LOOP_LOG file).
