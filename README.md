# SignalStack SMS

Self-hostable, multi-tenant **SMS/MMS messaging + campaigns + shared inbox + integration API** platform
(Next.js App Router · TypeScript · Prisma/Postgres · optional BullMQ/Redis). The current release remains
demo-safe: live SMS, billing, hosted AI, and production worker execution are off by default behind
executable gates while the standalone production roadmap is implemented.

The product target, minimal-dependency architecture, milestone graph, acceptance matrix, and current
evidence are in [`docs/STANDALONE_ROADMAP.md`](docs/STANDALONE_ROADMAP.md).

## Quick start

This repo uses npm as the canonical package manager; `package-lock.json` is the only committed
package-manager metadata.

```bash
bash scripts/agent/bootstrap.sh        # copy .env, install deps, generate Prisma client
docker compose up -d postgres redis    # local backing services
npm run db:migrate                     # apply schema
npm run demo:seed                      # seed demo data
npm run dev                            # http://localhost:3000
```

Product workspace is at `/dashboard`; the gated live-test console is at `/demo`.

In the default `DEMO_MODE=true` posture the dev server signs every visitor in as the demo
organization's owner — no login required. Built-in local authentication (`/login`, `/setup`, `/team`,
`/organizations`, `/account`, `/reset`) activates with `DEMO_MODE=false` + `AUTH_PROVIDER=local` and
requires a **production build** (`npm run build && npm start`) plus `AUTH_SESSION_SECRET`,
`AUTH_THROTTLE_SECRET`, and the database posture described in
[`docs/PRODUCTION_AUTH_RBAC.md`](docs/PRODUCTION_AUTH_RBAC.md). Bootstrap the first owner with
`npm run admin:create` (see [`docs/LOCAL_OPERATOR_RUNBOOK.md`](docs/LOCAL_OPERATOR_RUNBOOK.md)).

> **Note:** a plain `npm start` in the demo posture fails closed by design — production builds
> refuse `DEMO_MODE=true` (and a missing RLS boundary) unless `ALLOW_PRODUCTION_DEMO=true`
> explicitly acknowledges an intentionally public demo. Use `npm run dev` for local demo work.

## Run / build / test

```bash
npm run agent:bootstrap # alias for scripts/agent/bootstrap.sh
npm run agent:check # full local gate (alias: npm run validate)
npm run dev        # dev server
npm run build      # production build
npm start          # serve the production build (next start)
npm run validate   # full local gate: lint, typecheck, unit tests, build, domain gates
npm run test       # unit tests only
```

End-to-end (needs Postgres + `npx playwright install chromium`):

```bash
npm run test:e2e:smoke
```

If `playwright` browsers are unavailable in the shell runtime, run `npx playwright install chromium`
before `npm run test:e2e:smoke` or `npm run validate` (Linux Playwright support is version-sensitive).

## Environment

`bootstrap.sh` copies `.env.example` → `.env`. Demo-safe defaults: `DEMO_MODE=true`,
`LIVE_MESSAGING_ENABLED=false`, `LIVE_BILLING_ENABLED=false`, `MESSAGING_PROVIDER=dummy`,
`AI_PROVIDER=fake`. Twilio/Stripe keys are blank placeholders — keep real secrets out of git
(`npm run secrets:scan` enforces this). Production posture additionally requires
`DATABASE_RLS_ENFORCED=true`, distinct auth secrets, `TRUST_PROXY=true` behind a header-overwriting
ingress, and rejects `DEMO_MODE=true` without `ALLOW_PRODUCTION_DEMO=true`
(see `lib/env/runtime-config.ts` for the executable contract).

## Product surface

- `/dashboard` — contacts, campaigns, inbox, templates, analytics, compliance.
- `/settings` — go-live readiness + read-only operations surfaces.
- `/demo` — gated live-test SMS console.
- `/login`, `/setup`, `/team`, `/organizations`, `/account`, `/reset`, `/invite` — built-in local
  identity (active outside demo mode).

## Docs

- [`GOAL.md`](GOAL.md) — purpose, current state, definition of done.
- [`docs/STANDALONE_ROADMAP.md`](docs/STANDALONE_ROADMAP.md) — governing product roadmap, milestone graph, acceptance evidence.
- [`ROADMAP.md`](ROADMAP.md) — operational milestone view mapped to [`tickets/`](tickets/).
- [`AGENTS.md`](AGENTS.md) + [`docs/ai/REPO_MAP.md`](docs/ai/REPO_MAP.md) — autonomous-agent instructions and where code lives.
- [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) — honest register of remaining gaps and risks.
- [`contracts/`](contracts/) — executable behavior contracts (`npm run contracts:check` enforces).
- [`plan/`](plan/) — specs backlog (`plan/specs/SPEC-*.md`).
- [`docs/CANONICAL_IMPLEMENTATION_PLAN.md`](docs/CANONICAL_IMPLEMENTATION_PLAN.md) — historical bootstrap-era contract.

## Windows Development Quickstart & Troubleshooting

When developing on Windows:

- **WSL2 Backing Services**: If your backing services (Postgres, Redis) run in WSL2, standard localhost ports might not be directly available from the Windows host. To connect:
  1. Retrieve the WSL2 IP address by running:
     ```powershell
     wsl -d Ubuntu hostname -I
     ```
  2. Configure your `DATABASE_URL` and `REDIS_URL` in `.env` to point to that IP address (e.g., `postgresql://user:pass@<WSL2_IP>:5432/db` and `redis://<WSL2_IP>:6379`).
- **Clean Builds**: If you run into routing errors or `PageNotFoundError` during development or testing, delete the `.next/` directory and build cleanly:
  ```powershell
  Remove-Item -Recurse -Force .next
  npm run build
  ```
- **Sequential E2E Tests**: To run end-to-end tests successfully and avoid resource contention or database locking issues, execute them sequentially with a single worker:
  ```bash
  npx playwright test --workers=1
  ```
