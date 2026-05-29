# GOAL

## Purpose

SignalStack SMS is a demo-safe, multi-tenant SMB SMS/MMS marketing + shared-inbox + lead-qualification
SaaS (Next.js App Router + TypeScript + Prisma/Postgres + BullMQ). It is built to be driven by
autonomous coding agents: every policy is an executable gate, not prose. See `docs/CANONICAL_IMPLEMENTATION_PLAN.md`
for the full product/architecture contract.

## Current state (2026-05)

- Strong backend + contract foundations: tenant-scoped repos, contacts/CSV import, campaigns + preflight,
  durable queue jobs, shared inbox, compliance gates, fake AI, local usage/billing, Twilio webhook ingestion,
  provider metadata, readiness audit, operations surfaces.
- Browser product path at `/dashboard` (contacts, campaigns, inbox, templates, analytics, compliance).
- `npm run validate` green locally except `test:e2e:smoke` (needs Postgres + Playwright browsers).
- ~795 unit tests passing; lint + typecheck + build clean.
- Live SMS/billing/AI, production auth, production workers, and production deploy are intentionally **off**,
  behind hard gates. The only live external path is the isolated, multi-gated `/demo` live-test SMS form.

## Desired end state

A repo any agent can pick up cold and advance safely in one focused session: oriented in minutes via
`GOAL.md` + `docs/ai/REPO_MAP.md` + `npm run agent:brief`; a single green gate (`npm run validate`);
atomic tickets in `tickets/`; demo-safe defaults; hard gates protecting all real-world impact.

## Non-goals

- No live SMS/MMS, live billing, or live AI by default.
- No production deployment automation, production auth, or production workers until their hard gates are designed and approved.
- No competitor asset/UI cloning. No voice/WhatsApp/short-code. No full-CRM scope.
- Not chasing more low-value syntactic test variants (see `docs/NEXT_PROMPTS.md`); prefer product + correctness work.

## Constraints & assumptions

- Package manager: **npm** (`package-lock.json`). Node 22+ (dev uses 24).
- Postgres required for `db:migrate`/`db:seed`/e2e; `scripts/validate.ts` injects a demo `DATABASE_URL` for gate steps that only need it present.
- Windows-first dev (PowerShell gate `scripts/local-gate.ps1`); POSIX `scripts/agent/*.sh` wrappers added for cross-platform/CI.
- Secrets never committed: `.env` is gitignored; `.env.example` holds demo-safe placeholders; `npm run secrets:scan` gates it.
- Gate scripts + `docs/AXIOMS.md` are integrity-pinned; only humans change them.

## Agent guidance

- Read-first order, the loop, full command reference, and autonomous-vs-ask rules: **`AGENTS.md`**.
- Where things live and what to skip: **`docs/ai/REPO_MAP.md`**.
- Phased plan mapped to tickets: **`ROADMAP.md`**; product roadmap: `PLAN.md`.
- Follow demo-safe defaults; keep `orgId` on every tenant query; validate at boundaries with Zod; contracts before features.

## Definition of done (per change)

- `npm run validate` attempted; green, or each failure explained and ticketed.
- Worked ticket + relevant docs updated; follow-ups filed.
- No secret exposure; no hard-gate bypass.
- Honest status: a check is "passed" only if it ran and passed; unavailable gates recorded as "not run".
