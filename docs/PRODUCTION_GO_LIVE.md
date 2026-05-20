# Production Go-Live Gate

SignalStack SMS is demo-safe by default. Production deployment may run the app with local/demo behavior, but live external impact remains blocked until a future go-live milestone adds controlled enablement.

## Current Gate

`npm run production:gate` evaluates production-like environments when any of these values are `production` or `prod`:

- `NODE_ENV`
- `VERCEL_ENV`
- `DEPLOYMENT_ENV`
- `APP_ENV`

Without `ALLOW_PRODUCTION_EXTERNALS=true`, the gate blocks:

- `LIVE_MESSAGING_ENABLED=true`
- `LIVE_BILLING_ENABLED=true`
- `MESSAGING_PROVIDER` values other than `dummy`
- `AI_PROVIDER` values other than `fake`
- Twilio account, auth-token, messaging-service, or from-number environment configuration
- Stripe secret or webhook-secret environment configuration

This gate is part of `npm run validate`.

## Allowed Production-Like Demo Deployment

A production-like demo deployment must keep:

```bash
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

Provider credential metadata may exist in the database for readiness screens, but it must remain redacted local metadata only. Raw provider secrets must not be stored in the database or exposed through API responses.

## Future Live Enablement Requirements

A future live-send milestone must add and validate all of these before any live external action is allowed:

- Explicit org-level live messaging enablement separate from environment flags.
- Complete compliance profile with approved A2P status.
- Provider credential storage through a real secret manager, not raw database fields.
- Provider number ownership/readiness verification.
- Send-rate limits and queue backpressure appropriate for provider limits.
- Billing live-enable gate and test coverage proving Stripe calls cannot happen in demo/CI.
- Manual break-glass documentation for disabling live sends.
- Tests proving alternate send paths cannot bypass the centralized messaging hard gate.

Until those controls exist, `ALLOW_PRODUCTION_EXTERNALS=true` is reserved as a future controlled-deployment override and must not be used for routine demo or CI deployments.
