# Production Deployment Runbook

This runbook covers production-like demo deployments only. It does not authorize live SMS, live billing, live AI, Twilio verification, Stripe calls, provider-side credential changes, or real notifications.

## Deployment Class

Current supported class: demo-safe production-like deployment.

Required environment:

```bash
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
API_RATE_LIMIT_ENABLED=true
```

Forbidden for the current deployment class:

- `ALLOW_PRODUCTION_EXTERNALS=true`
- `LIVE_MESSAGING_ENABLED=true`
- `LIVE_BILLING_ENABLED=true`
- `MESSAGING_PROVIDER=twilio`
- `AI_PROVIDER` values other than `fake`
- Twilio account, auth-token, messaging-service, or from-number environment secrets
- Stripe secret or webhook-secret environment secrets
- Clerk secret or publishable-key environment configuration

Provider credential metadata may be entered through `/settings/provider`, but it remains local readiness metadata only. Raw provider auth tokens must not be stored, logged, returned by APIs, committed to the repo, or placed in production environment variables under the current gate.

## Pre-Deploy Checks

Run locally before deployment:

```bash
npm install
npm run db:generate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate
npm run demo:seed
npm run validate
npm run test:e2e:demo
```

Run the production gate against the intended environment values before pushing them to a host:

```bash
$env:APP_ENV='production'
$env:DEMO_MODE='true'
$env:LIVE_MESSAGING_ENABLED='false'
$env:LIVE_BILLING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
$env:AI_PROVIDER='fake'
npm run production:gate
```

Expected result: `Production deployment gate passed with external-impact defaults blocked.`

## Database Deployment

Use only non-destructive migration deployment for managed environments:

```bash
npm run db:deploy
```

Do not run `npm run db:reset`, manual destructive SQL, or production data deletion as part of this runbook.

Seed data is for local/demo workspaces. Do not run `npm run demo:seed` against a real customer production database unless the environment is explicitly a disposable demo tenant.

## Post-Deploy Smoke

Verify these routes in the deployed app:

- `/api/health` reports demo-safe defaults.
- `/demo` renders the investor demo console.
- `/settings` shows live messaging blocked.
- `/settings/provider` shows redacted provider metadata only.

Verify these behaviors:

- Scheduling a demo campaign creates local queue records only.
- Demo inbound STOP updates local consent only.
- AI endpoints return fake provider responses only.
- Billing usage creates local usage records only.
- Provider credential save/clear updates local metadata and rotation history only.

Production observability planning is documented in `docs/PRODUCTION_OBSERVABILITY.md`. Current observability is platform/local only and must not export secrets, full message bodies, notifications, live provider calls, billing events, or telemetry to a third-party vendor by default.

Platform-specific hosting notes are documented in `docs/DEPLOYMENT_PLATFORM_NOTES.md`. Current platform guidance covers demo-safe production-like hosting only and does not authorize live messaging, billing, AI, provider calls, notifications, third-party telemetry exports, real secrets, or destructive data operations.

Production worker execution is separately blocked today. The planning gate for any future live worker deployment is documented in `docs/PRODUCTION_WORKER_POLICY.md`; the current deployment class does not run scheduled campaign workers in production-like runtimes.

Production auth/RBAC planning is documented in `docs/PRODUCTION_AUTH_RBAC.md`. The current deployment class uses the deterministic demo session only; Clerk configuration, user invitations, role changes, suspensions, membership deletion, email, notifications, and real customer access remain blocked until a future auth milestone adds executable controls.

## Rollback

Rollback is the hosting platform's previous build plus database migration discipline:

- Prefer redeploying the previous green build for app regressions.
- Do not roll back database migrations with destructive SQL unless a future, reviewed production data playbook exists.
- If external-impact flags are ever accidentally set, immediately restore the required demo-safe environment values and rerun `npm run production:gate`.

## Incident Switches

These values must remain available to force the product back into a no-external-impact posture:

```bash
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

If the app is deployed with any production-like environment marker, `npm run production:gate` must still pass before the deployment is considered valid.
