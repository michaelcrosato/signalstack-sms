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
- Clerk secret or publishable-key environment configuration

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

M4 provider Auth Tokens may persist only as account-hash/AAD-bound AES-256-GCM ciphertext under the
separately provisioned `SECRETS_MASTER_KEY`; plaintext is never stored or exposed. Legacy
`ProviderCredential`/`ProviderCredentialRotation` rows remain unverified/display-only. M4 verification and
ownership do not enable a live send.

## Remaining Live Enablement Requirements

M5 implements the durable direct-message reservation, final gate, and exact direct-worker authorization.
Complete production enablement still requires all of these controls before the whole platform is live-ready:

- Explicit org-level live messaging enablement separate from environment flags.
- Complete compliance profile with approved A2P status.
- Production provisioning and rotation of `SECRETS_MASTER_KEY`, with access restricted to approved M4/M5
  operation boundaries and no plaintext database fields.
- The implemented built-in auth/RBAC boundary plus completed M2 database tenant enforcement, as documented
  in `docs/PRODUCTION_AUTH_RBAC.md`; an external OIDC adapter is optional, not a go-live dependency.
- Preserve the implemented M5 durable message/attempt reservation, provider-call frontier, centralized hard
  gate, exact `production-live-direct` worker class, and M4 provider number/credential ownership checks.
- A production campaign worker policy gate as documented in `docs/PRODUCTION_WORKER_POLICY.md`.
- Send-rate limits and queue backpressure appropriate for provider limits.
- Billing live-enable gate and test coverage proving Stripe calls cannot happen in demo/CI.
- Manual break-glass documentation for disabling live sends.
- Tests proving alternate send paths cannot bypass the centralized messaging hard gate.

Until those controls exist, `ALLOW_PRODUCTION_EXTERNALS=true` is reserved as a future controlled-deployment override and must not be used for routine demo or CI deployments.
