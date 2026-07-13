# Demo Mode

Demo mode is the default. It uses the dummy messaging provider and fake AI provider and must not require Twilio, Stripe, Clerk secrets, real phone numbers, or paid AI calls.

Seeded provider-number and legacy credential/rotation rows, webhook events, delivery evidence, usage events,
and readiness-audit events are local metadata only. They do not prove M4 ownership or trigger provider calls.
An explicit same-origin ADMIN may separately submit an unprefilled credential for bounded M4 verification,
rotation, health, or discovery; the Auth Token persists only as a bound AES-256-GCM envelope and is never
rendered or exported. No M4 action sends, purchases, releases, ports, or configures a provider resource.

## Canonical Operator Surfaces

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

`/settings` is the consolidated go-live readiness view. It carries the remaining runtime, environment, provider-number, campaign, contact, data, audience, template, inbox, webhook, delivery, team, billing, reporting, AI, notification, integration, workflow, release, and blocker summaries that were formerly spread across per-area settings pages.

Legacy per-area settings paths are not application routes. Interactive product work belongs under `/dashboard/contacts`, `/dashboard/campaigns`, `/dashboard/inbox`, `/dashboard/templates`, `/dashboard/analytics`, and `/dashboard/compliance`. The seeded demo checkpoint is `/demo`.

The shared operator-surface inventory drives the root launch view, demo console, settings directory, operations index, and runbook navigation. Unit coverage pins the ten-page child allowlist, rejects static links to non-allowlisted settings pages, checks inventory/page bijection, and verifies safety-sensitive links before browser demo coverage runs.

## Surface Boundaries

- `/settings/provider` provides M4 ADMIN account verification, encrypted credential rotation, health,
  discovery/import, and local revoke/default/disable controls plus legacy display-only rotation export. Its
  explicit read-only provider checks are bounded; it does not revoke provider-side credentials, mutate
  provider resources, send messages, or enable live messaging.
- `/settings/compliance` displays the existing compliance profile, checklist completeness, A2P metadata status, and hard-gate blockers. It does not register or verify anything with a provider.
- `/settings/readiness-audit` and `/settings/exports` expose bounded, tenant-scoped local CSV links. Rendering either page does not execute an export or mutate records.
- `/settings/queue` displays local job timing, payload validity, worker settings, and backend metadata. It does not enqueue jobs, run workers, call Redis, or call providers.
- `/settings/health`, `/settings/security`, and `/settings/validation` are read-only descriptions of local gates and posture. They do not execute probes, commands, scans, or tests.
- `/settings/runbook` displays demo-safe validation, seed, worker, export, and repair-loop commands. It does not execute them.

Seeded outbound delivery examples use dummy-style provider IDs and local error codes. They exist only so dashboards and campaign delivery review can show delivered, pending, and failed evidence without sending SMS, running workers, replaying webhooks, billing, or notifying anyone.

Local contact phone normalization and CSV import never call Twilio. When paid single-contact Lookup is explicitly enabled, deterministic demo membership is not authorization: the request must also carry a dedicated operator header that constant-time matches the 32-256 character server-only `LIVE_LOOKUP_OPERATOR_TOKEN`. That token is never rendered, logged, persisted, returned, or forwarded to Twilio, and a missing or mismatched provider phone echo fails closed without writing a contact.

## Human-Gated Live-Test Exception

`/demo` contains the repository's only live-send exception. The deterministic demo session is not operator authentication: every POST, including an idempotent outcome check, additionally requires an operator-entered token that constant-time matches the server-only `LIVE_TEST_SMS_OPERATOR_TOKEN`. The configured token must be 32-256 characters and must never be rendered, prefilled, logged, persisted, committed, or shared in browser-delivered configuration. The confirmation phrase is also entered out of band and is not included in the client bundle.

The page and `GET /api/demo/live-test-sms` expose only readiness blocker codes, configured counts, and last-four hints. Full allowlist and from-number values remain server-side; an operator must enter the complete allowlisted recipient. A new request is durably reserved before Twilio is called. A validated 4xx rejection with an integer provider error code and no provider SID or an immediate terminal status is recorded as failed, while a network error, bounded timeout, 5xx/other non-4xx response, malformed 4xx response, non-2xx response with a provider SID, 2xx response without a provider ID, or local provider-result persistence failure returns `202` and leaves the reservation pending. Retrying the same UUID with the same actor, recipient, body, and operator token can inspect that reservation but cannot send again.

Milestone 6 adds a compliance checklist for go-live readiness, but demo mode still blocks live messaging even when checklist fields are complete. STOP/HELP demo inbound flows update local database state only.

Milestone 7 AI endpoints use deterministic fake outputs only. Setting `AI_PROVIDER` to anything other than `fake` blocks those endpoints until a future live-AI gate exists.

Milestone 8 usage and billing records are local database rows for demo analytics. They do not create Stripe objects or charge payment methods.

## Investor Demo Path

The `/demo` route shows a compact seeded workspace summary:

1. Import opted-in contacts from CSV.
2. Preflight and schedule a demo-safe campaign.
3. Capture inbound HELP and STOP replies through local demo inbound APIs.
4. Generate fake AI lead qualification and related outputs.
5. Review analytics and local-only usage records.

`e2e/demo-path.spec.ts` drives this flow through local API routes. It requires the local database to be migrated and seeded, and it still does not send SMS, call live AI, or create billing provider artifacts.
