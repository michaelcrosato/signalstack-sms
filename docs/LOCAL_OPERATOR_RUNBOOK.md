# Local Operator Runbook

## Run the built-in identity profile

Use a production build for every browser session backed by built-in local auth:

```text
npm run build
npm run start
```

Built-in local auth intentionally fails closed under `npm run dev` because the current Next development
Flight debug payload exposes request Cookie headers to page HTML. `npm run dev` remains suitable for the
credential-free deterministic demo profile.

Production local auth also requires a trusted reverse proxy or ingress. Bind the application port only
to loopback or a private container network; expose the proxy instead. The proxy must discard inbound
`X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`, replace them with connection-derived
values, and only then may the application set `TRUST_PROXY=true`. Direct public exposure with
`TRUST_PROXY=true` lets clients spoof rate-limit identities; `TRUST_PROXY=false` is rejected for the
production local-auth profile because all clients would share one fallback throttle bucket.

Use distinct randomly generated values for `AUTH_SESSION_SECRET` and `AUTH_THROTTLE_SECRET`. Session rows
store only a domain-separated HMAC lookup hash. Rotating `AUTH_SESSION_SECRET` is a global sign-out: every
existing browser session becomes unusable and users must authenticate again. A production process fails
closed rather than reverting to unkeyed session lookup when this secret is absent.

This runbook covers local and demo-safe operations only. It does not authorize live SMS, live email, live notifications, live billing, real Stripe charges, real Twilio sends, provider-side credential changes, real secrets, destructive production database operations, irreversible deletion, spam, or data leakage.

The same local-only checklist is available at `/settings/runbook`. That page is read-only: it displays commands and safety boundaries, but it must not execute commands, mutate records, call providers, create billing records, send notifications, expose secrets, or enable live messaging.

## Required Defaults

```bash
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

## Human-Gated Live-Test SMS

This runbook does not authorize a live send. If a human explicitly approves the isolated `/demo` exception, its environment must include a randomly generated, server-only `LIVE_TEST_SMS_OPERATOR_TOKEN` between 32 and 256 characters and a bounded `LIVE_TEST_SMS_TIMEOUT_MS` (default `5000`, clamped to `1000..10000`). Keep the token out of source control, screenshots, logs, support artifacts, browser configuration, and provider/readiness metadata.

The operator enters the complete allowlisted recipient, the confirmation phrase, and the operator token for each POST. The page never prefills or renders those operator controls and clears them from component state after a response. Readiness shows only recipient counts and last-four hints, never complete allowlist or from-number values. Re-enter the controls when retrying a request that returned `202`; the unchanged UUID plus actor/recipient/body binding retrieves the pending reservation without a second provider call. Use a new UUID only after a definitive failure and an intentional human decision to attempt a new send.

## Human-Gated Paid Phone Lookup

Local contact normalization and every CSV import remain free and provider-independent. If a human separately authorizes paid Twilio Lookup for a single-contact create, configure a random server-only `LIVE_LOOKUP_OPERATOR_TOKEN` between 32 and 256 characters and supply that exact secret only in the `x-signalstack-lookup-token` request header. The deterministic demo membership role does not authorize the paid request. Keep this token out of source control, URLs, browser-delivered configuration, screenshots, logs, and support artifacts; the server neither persists nor forwards it to Twilio.

## Daily Local Start

```bash
npm install
npm run db:generate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run demo:seed
npm run validate
```

## Built-in Administrator Bootstrap and Recovery

`npm run admin:create` is a noninteractive local-auth operation. It accepts no command-line arguments.
Never place a password or bootstrap token after the command, in `ADMIN_CREATE_PASSWORD`, in shell history,
or in a support transcript. The command requires an explicit PostgreSQL target, `AUTH_PROVIDER=local`, and
`DEMO_MODE=false`.

Set these one-shot environment values before invoking the command:

```powershell
$env:DEMO_MODE='false'
$env:AUTH_PROVIDER='local'
$env:DATABASE_URL='<postgresql-url>'
$env:ADMIN_CREATE_MODE='existing-org'
$env:ADMIN_CREATE_EMAIL='recovery-owner@example.com'
$env:ADMIN_CREATE_DISPLAY_NAME='Recovery Owner'
$env:ADMIN_CREATE_ORG_SLUG='exact-existing-slug'
$env:ADMIN_CREATE_PASSWORD_FILE='C:\protected\signalstack-admin-password'
$env:ADMIN_CREATE_PASSWORD_STDIN='false'
npm run admin:create
```

Use `ADMIN_CREATE_MODE=bootstrap` for a clean installation and also set
`ADMIN_CREATE_ORG_NAME`, `ADMIN_CREATE_TIMEZONE`, and the server-only `BOOTSTRAP_TOKEN`. That mode reuses
the same one-time serializable bootstrap claim as the setup API. Existing-organization mode refuses demo
organizations and any email already present in the user table; it never replaces a credential or adopts an
existing identity.

The password file must contain the exact intended UTF-8 bytes, be no larger than 256 bytes, and should not
include a trailing newline unless that newline is intentionally part of the password. Symlinks are refused.
On POSIX, set mode `0600`; group/world permission bits are refused. Windows emits a warning because Node
cannot portably prove ACL safety, so restrict the file to the service/operator account before proceeding.
For a protected pipeline instead of a file, set `ADMIN_CREATE_PASSWORD_STDIN=true`, leave
`ADMIN_CREATE_PASSWORD_FILE` empty, and pipe exact bytes from a secret manager; interactive terminal input
is refused. Success prints only sanitized user ID/email, organization ID/slug, and `OWNER` role.

## Operator Password Reset Link

Tenant roles cannot issue password-reset links because one local credential is shared across all of a
user's organization memberships. Use the zero-argument operator command from a protected service shell:

```powershell
$env:DEMO_MODE='false'
$env:AUTH_PROVIDER='local'
$env:DATABASE_URL='<postgresql-url>'
$env:ADMIN_RESET_EMAIL='member@example.com'
$env:ADMIN_RESET_ORG_SLUG='exact-active-org-slug'
$env:ADMIN_RESET_EXPIRES_MINUTES='60'
npm run admin:reset-link
```

The enabled subject must have an ACTIVE membership in that exact non-demo organization. The command
supports multi-organization identities, revokes their previous unused reset links, stores only the new
hash, and prints one `/reset#token=...` fragment with its expiry. Deliver that fragment through a trusted
out-of-band channel and clear it from the terminal as operational policy permits. Do not place the bearer
in environment variables, command arguments, logs, tickets, screenshots, shell history, or source control.
The recipient opens the complete link and chooses a replacement password; completion revokes every session
for that identity across organizations. Failures print only a stable sanitized code.

## Autonomous Codex Loop

```powershell
.\codex-skynet-max.ps1 -FullYolo -KeepAwake
```

The loop is endless by default. Use `-FuseMinutes <minutes>` only for a capped run. Failed commands or protected gates are not green handoffs.

For a strict one-shot launch check:

```powershell
.\codex-skynet-max.ps1 -PreflightOnly
```

Run the seeded investor path after changes to pages, APIs, seed data, provider metadata, exports, campaigns, inbox, AI, analytics, billing, or middleware:

```bash
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run test:e2e:demo
```

## Local Workers

Run the database-backed dummy worker only with live messaging disabled:

```bash
$env:LIVE_MESSAGING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
npm run worker
```

For bounded polling:

```bash
$env:WORKER_MAX_ITERATIONS='1'
$env:WORKER_POLL_INTERVAL_MS='1000'
$env:LIVE_MESSAGING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
npm run worker:watch
```

Optional BullMQ/Redis checks remain local and must not bypass the durable database job record:

```bash
$env:QUEUE_BACKEND='bullmq'
$env:REDIS_URL='redis://localhost:6379'
$env:LIVE_MESSAGING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
npm run queue:bullmq:smoke
```

## Admin Exports

Use `/settings/exports` for read-only local CSV exports:

- Readiness audit events: `/api/settings/readiness-audit/export`
- Redacted provider credential rotation history: `/api/settings/provider/rotations/export`

Exports are tenant-scoped local metadata only. They must not expose raw auth tokens, provider token fingerprints, customer secrets, provider verification results, full message bodies, live billing identifiers, or provider-side state. Export routes must not mutate records, call providers, create billing records, send notifications, or enable live messaging.

## Canonical Settings Model

The implemented settings child-page allowlist is exactly:

- `/settings/operations`
- `/settings/health`
- `/settings/security`
- `/settings/validation`
- `/settings/queue`
- `/settings/provider`
- `/settings/compliance`
- `/settings/readiness-audit`
- `/settings/exports`
- `/settings/runbook`

`/settings` is the consolidated go-live readiness view. Runtime, environment, number, campaign, contact, data, audience, template, inbox, webhook, delivery, team, billing, reporting, AI, notification, integration, workflow, release, and blocker summaries live there instead of on separate per-area settings pages.

Legacy per-area settings paths are not routes. Interactive product work belongs under `/dashboard/contacts`, `/dashboard/campaigns`, `/dashboard/inbox`, `/dashboard/templates`, `/dashboard/analytics`, and `/dashboard/compliance`; the seeded demo checkpoint is `/demo`.

The shared operator-surface inventory drives the root launch view, demo console, settings directory, operations index, and runbook links. Unit coverage pins the allowlist and rejects static links to non-allowlisted settings pages.

## Focused Operator Views

- Use `/settings/operations` to navigate the surviving operator surfaces.
- Use `/settings/health` to review the health contract, demo-safe defaults, and runtime blockers. Rendering it does not execute a probe.
- Use `/settings/queue` to review due/future jobs, payload validity, worker settings, and queue-backend metadata. Rendering it does not enqueue jobs, run workers, call Redis, or call providers.
- Use `/settings/provider` for M4 ADMIN account verification, encrypted credential rotation, explicit health,
  discovery/import, local revoke/default/disable, and legacy bounded rotation-history exports. Explicit
  provider reads are bounded; local revoke does not revoke at Twilio, and no control enables live messaging.
- Use `/settings/security` to review demo-safe gates, rate-limit policy, production overrides, and secret-storage boundaries. It does not scan files or expose environment values.
- Use `/settings/readiness-audit` to review tenant-scoped readiness events and bounded exports. It does not mutate or replay events.

Operator views remain demo-safe. `/settings/provider` is the explicit M4 exception that may mutate local
provider-control rows and perform bounded ADMIN read-only provider verification/discovery/health; it cannot
send or mutate provider resources. Other operator views remain display-focused and must not call providers,
create billing records, send notifications, or enable live messaging.

## Validation Operations

Use `/settings/validation` for read-only local gate review before demos or repair work. It displays the validation inventory, gate boundaries, repair signals, and no-impact states. It must not execute commands, inspect logs or test reports, scan files, read `.env.local`, mutate records, call providers, call live AI, call Stripe, send SMS, email, or notifications, expose secrets, or enable live features.

## Compliance Detail

Use `/settings/compliance` for read-only compliance profile review. It displays profile completeness, demo A2P metadata status, live-message hard-gate blockers, recent local readiness events, and the CSV export link. It must not mutate compliance records, verify provider registration, expose secrets, call providers, send notifications, create billing records, or enable live messaging.

## Repair Loop

When validation fails:

1. Diagnose the smallest failing command.
2. Repair the local code, docs, contracts, or tests.
3. Rerun the smallest failing command.
4. Rerun `npm run validate`.
5. Rerun `npm run test:e2e:demo` when the change touches the seeded demo path.

If a local dependency blocks progress, record the exact command, error, suspected cause, and next repair step in `BLOCKERS.codex.md`.

## Production Boundary

Production-like demo deployment is covered by `docs/PRODUCTION_DEPLOYMENT.md`. Future live SMS, live
billing, live AI, live provider verification, real notifications, production RLS/package completion, or
provider-side credential operations require separate human-approved go-live gates and are outside this
local runbook. Built-in local identity itself is implemented under the requirements above.
