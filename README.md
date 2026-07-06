# SignalStack SMS

Demo-safe, multi-tenant SMB **SMS/MMS marketing + shared inbox + lead-qualification** SaaS
(Next.js App Router · TypeScript · Prisma/Postgres · BullMQ/Redis). All real-world impact — live
SMS, billing, AI, and production auth/workers/deploy — is **off by default** behind executable hard
gates. The only intentional live path is the multi-gated `/demo` live-test SMS form.

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
`AI_PROVIDER=fake`. Clerk/Twilio/Stripe keys are blank placeholders — keep real secrets out of git
(`npm run secrets:scan` enforces this).

## Product surface

- `/dashboard` — contacts, campaigns, inbox, templates, analytics, compliance.
- `/settings` — go-live readiness + 10 read-only operations surfaces.
- `/demo` — gated live-test SMS console.

## Docs

- [`GOAL.md`](GOAL.md) — purpose, current state, definition of done.
- [`ROADMAP.md`](ROADMAP.md) — phased plan mapped to [`tickets/`](tickets/).
- [`AGENTS.md`](AGENTS.md) + [`docs/ai/REPO_MAP.md`](docs/ai/REPO_MAP.md) — autonomous-agent instructions and where code lives.
- [`plan/`](plan/) — research-informed transformation plan (specs, roadmap, execution prompt).
- [`docs/CANONICAL_IMPLEMENTATION_PLAN.md`](docs/CANONICAL_IMPLEMENTATION_PLAN.md) — governing implementation contract.

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
