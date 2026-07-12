# Production Deployment Runbook

This runbook covers the currently packaged demo-safe deployment class. Built-in local identity and the
M2 non-owner database boundary are implemented, but M10 has not yet delivered the full self-contained
production stack. This runbook does not
authorize live SMS, live billing, live AI, Twilio verification, Stripe calls, provider-side credential
changes, or real notifications.

## Deployment Class

Current supported class: demo-safe production-like deployment.

Required environment:

```bash
APP_ENV=production
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
API_RATE_LIMIT_ENABLED=true
DATABASE_RLS_ENFORCED=true
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

Use separate credentials for migrations and each runtime process. `MIGRATION_DATABASE_URL` must identify
the table-owning migration/operator login; it may be NOSUPERUSER and NOBYPASSRLS because the migrations
grant it the explicit NOLOGIN `signalstack_owner` capability. It still needs the normal database/schema
ownership and role-administration rights required to install the capability graph. `DATABASE_URL` must
identify the desired non-owner runtime login and include its 16+ character password. Both URLs must target
the same PostgreSQL database.

Deploy migrations and provision the web login from an operator shell:

```powershell
$env:MIGRATION_DATABASE_URL='<postgresql owner URL>'
$env:DATABASE_URL='<postgresql web runtime URL>'
npm run db:deploy
npm run db:provision:web
```

Provision a separate worker login by changing only the runtime URL:

```powershell
$env:DATABASE_URL='<postgresql worker runtime URL>'
npm run db:provision:worker
```

The provisioner creates or hardens the login as `NOINHERIT NOSUPERUSER NOBYPASSRLS`, explicitly revokes
`signalstack_owner` and other broad memberships, and grants the reviewed web capability or the worker's
dispatch plus tenant capabilities. Because the login is NOINHERIT, application code must select exactly
one fixed role inside each short transaction. The 40 migrations create the NOLOGIN capability roles,
force RLS on all 27 protected tables, split tenant-root/global-user control access into exact-evidence
command policies with no control DELETE on those tables, and install queue discovery atomically through
the bounded `claim_due_queue_jobs` security-definer function. Dispatch eligibility/lease timestamps come
from the database; null, stale/skewed, or out-of-range arguments fail before any claim.

After provisioning:

- Run the web process with only its web `DATABASE_URL`.
- Run the worker process with only its worker `DATABASE_URL`.
- Remove `MIGRATION_DATABASE_URL` from both process environments; retain it only in the operator/migration
  secret scope.
- Keep `DATABASE_RLS_ENFORCED=true`. Production startup and the first database context attest that the
  login is non-owner/NOINHERIT, has no RLS bypass or owner-capability membership, and owns no protected
  table. Attestation also compares the exact command, role, permissiveness, and predicates of every
  runtime policy rather than trusting catalog counts alone.

Use only non-destructive migration deployment for managed environments:

```bash
npm run db:deploy
```

On a clean database this applies all 40 migrations. For a large existing installation, first run the
count-only integrity preflight and rehearse against a production-sized restored copy, take the required
backup, and schedule a maintenance window: composite index/constraint creation, constraint validation,
trigger installation, and RLS/policy replacement can acquire locks and have not been claimed as an
online zero-downtime upgrade.

Do not run `npm run db:reset`, manual destructive SQL, or production data deletion as part of this runbook.

Seed data is for local/demo workspaces. Do not run `npm run demo:seed` against a real customer production database unless the environment is explicitly a disposable demo tenant.

## Tenant-Boundary Proof

The mandatory database gate requires a disposable PostgreSQL database and an owner-capable test
credential because it creates temporary roles and two-tenant fixtures:

```powershell
$env:RUN_DB_TESTS='true'
$env:DATABASE_URL='<disposable PostgreSQL owner URL>'
npm run test:tenant-db
```

Expected evidence is eight files / 33 tests covering tenant A/B, all 27 protected tables, missing context,
forged reads/writes/relations, rollback, semantic policy fingerprints, command-specific control denial,
worker dispatch, and multi-connection pool reuse. The complete database run is 37 files / 186 tests; the
focused auth database run is nine files / 38 tests. The tenant gate also creates a fresh database and
applies all 40 migrations through a non-superuser/non-BYPASSRLS table owner, exercises historical
validation triggers and worker dispatch, and verifies that `PUBLIC` cannot execute the dispatch function.

The production local-auth browser proof requires distinct loopback migration/runtime URLs. It builds and
starts the app without exposing `MIGRATION_DATABASE_URL` to the server, provisions/cleans fixtures through
the owner connection, and exercises the product through the non-owner web login:

```powershell
$env:RUN_LOCAL_AUTH_E2E='true'
$env:MIGRATION_DATABASE_URL='<dedicated loopback PostgreSQL owner URL>'
$env:DATABASE_URL='<dedicated loopback PostgreSQL non-owner web URL>'
npm run test:e2e:local-auth:production
```

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

Production auth/RBAC is documented in `docs/PRODUCTION_AUTH_RBAC.md`. Built-in local credentials,
sessions, organization selection, invitations, roles, suspension, membership deletion, and operator
recovery are implemented without Clerk. This deployment recipe still selects explicit demo mode until the
M10 package adds the hardened local-auth ingress/secrets/backup profile; identity completion does not enable
email, notifications, provider calls, or live customer messaging.

## Rollback

Rollback is the hosting platform's previous build plus database migration discipline:

- Prefer redeploying the previous green build for app regressions.
- Do not roll back database migrations with destructive SQL unless a future, reviewed production data playbook exists.
- If external-impact flags are ever accidentally set, immediately restore the required demo-safe environment values and rerun `npm run production:gate`.

## Incident Switches

These values must remain available to force the product back into a no-external-impact posture:

```bash
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

Do **not** flip `DEMO_MODE=true` on a production deployment as an incident switch: demo mode disables
authentication and would grant every anonymous visitor an owner session. Production posture rejects
`DEMO_MODE=true` (config parse failure plus the `DEMO_MODE_WITHOUT_PRODUCTION_DEMO_ACK` deployment
blocker) unless `ALLOW_PRODUCTION_DEMO=true` explicitly acknowledges an intentionally public,
throwaway demo deployment.

If the app is deployed with any production-like environment marker, `npm run production:gate` must still pass before the deployment is considered valid.
