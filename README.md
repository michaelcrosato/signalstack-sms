# SignalStack SMS

SignalStack SMS is a 100% AI-coded SMB SMS/MMS SaaS repo. The current implementation is demo-safe through Milestone 9 foundations: contacts, consent, CSV import, campaigns, preflight/scheduling records, shared inbox, compliance gates, fake AI, local analytics/billing records, and an investor demo path.

## Demo-safe defaults

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Local validation

```bash
npm install
npm run db:generate
npm run db:migrate
npm run demo:seed
npm run validate
```

If Playwright browsers are missing:

```bash
npx playwright install chromium
npm run test:e2e:smoke
```

Investor demo path:

```bash
npm run test:e2e -- e2e/demo-path.spec.ts --project=chromium
```

All flows remain local/demo-only unless future hard gates explicitly enable live providers.

Production-like demo deployment is documented in `docs/PRODUCTION_GO_LIVE.md`. The current gate permits demo-safe production deployments only and keeps live SMS, billing, provider calls, and live AI blocked by default.

Deployment platform notes are documented in `docs/DEPLOYMENT_PLATFORM_NOTES.md`; `npm run platform:check` verifies that demo-safe hosting boundaries remain documented and is included in `npm run validate`.

Production observability planning is documented in `docs/PRODUCTION_OBSERVABILITY.md`. Current observability guidance is local/platform-only and does not add third-party telemetry, notifications, live providers, or billing side effects.

Local usage and analytics review is available at `/settings/usage`. It renders existing tenant-scoped metrics and usage events only; it does not call Stripe, create billing provider artifacts, call providers, send notifications, or enable live messaging.

The root route `/` is a local launch dashboard with demo-safe defaults and links to the seeded demo, go-live readiness, provider metadata, system status, usage, and admin export views.

Local operator procedures are documented in `docs/LOCAL_OPERATOR_RUNBOOK.md`; `npm run operator:check` verifies the runbook and is included in `npm run validate`.

The same local-only operator checklist is visible at `/settings/runbook`. It displays commands and safety boundaries only; it does not execute commands or create side effects.

The read-only `/settings/system` page summarizes local safety defaults, runtime markers, queue backend metadata, worker limits, and API rate-limit policy without mutations or external side effects.
