# Deployment Platform Notes

These notes cover demo-safe production-like hosting only. They do not authorize live SMS, live email, live notifications, live billing, real Stripe charges, real Twilio sends, real provider verification, provider-side credential changes, real secrets, destructive production database operations, irreversible deletion, spam, or data leakage.

## Supported Platform Shape

The current app can run on a managed Node.js platform that supports:

- Next.js App Router server rendering
- PostgreSQL reachable through `DATABASE_URL`
- build commands with `npm install`, `npm run db:generate`, and `npm run build`
- runtime commands that keep demo-safe environment defaults
- optional background workers as a separate process only when live messaging is disabled and `MESSAGING_PROVIDER=dummy`

The default deployment class remains demo-safe production-like deployment. It is suitable for investor demos, internal stakeholder review, and local-to-host smoke checks.

## Required Environment

Use these values for every demo-safe deployment:

```bash
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
API_RATE_LIMIT_ENABLED=true
```

Set production-like markers only with the same no-external-impact defaults:

```bash
APP_ENV=production
NODE_ENV=production
```

`npm run production:gate` must pass with the intended environment before deployment is accepted.

## Forbidden Environment Values

Do not configure these in the current deployment class:

- `ALLOW_PRODUCTION_EXTERNALS=true`
- `LIVE_MESSAGING_ENABLED=true`
- `LIVE_BILLING_ENABLED=true`
- `MESSAGING_PROVIDER=twilio`
- `AI_PROVIDER` values other than `fake`
- Twilio account, auth-token, messaging-service, or from-number environment secrets
- Stripe secret or webhook-secret environment secrets
- third-party telemetry export credentials

Provider credential readiness metadata may be entered in `/settings/provider`, but raw provider secrets must not be stored in environment variables, database rows, logs, exports, or screenshots under the current gate.

## Build And Release Commands

Recommended build sequence:

```bash
npm install
npm run db:generate
npm run build
```

Recommended release checks:

```bash
npm run validate
npm run production:gate
```

For database migration deployment, use:

```bash
npm run db:deploy
```

Do not run `npm run db:reset`, destructive SQL, demo seed commands against real customer data, or provider/billing setup commands as part of platform release.

## Worker Notes

The database-backed worker and optional BullMQ worker remain local/demo-only until a future live-send milestone adds production controls.

If a platform supports worker processes, the current safe worker shape is:

```bash
LIVE_MESSAGING_ENABLED=false
MESSAGING_PROVIDER=dummy
npm run worker
```

Optional Redis/BullMQ deployment must keep durable database `QueueJob` rows as the source of truth and must not bypass the centralized messaging hard gate.

## Smoke Routes

After deployment, verify:

- `/api/health`
- `/demo`
- `/settings`
- `/settings/system`
- `/settings/provider`
- `/settings/exports`

These checks must confirm that live messaging, live billing, live AI, provider calls, notifications, and external telemetry remain blocked.

## Future Platform Work

Future live deployment work must add separate hard gates for secret-manager integration, provider verification, live billing, notification channels, production observability exports, queue backpressure, incident switches, and production data protection before any external-impact behavior is enabled.
