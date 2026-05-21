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

Reporting index review is available at `/settings/reports`. It renders existing local reporting surfaces, tenant metrics, export links, and readiness signals only; it does not execute reports, create exports, mutate records, call providers, bill, notify, expose secrets, or enable live features.

Integration operations review is available at `/settings/integrations`. It renders existing provider, number, webhook, AI, billing, and notification boundaries only; it does not call providers, submit prompts, call live AI, call Stripe, notify, send SMS or email, mutate records, enqueue jobs, expose secrets, export data, or enable live features.

Workflow operations review is available at `/settings/workflows`. It renders existing demo workflow checkpoints across audience, campaigns, queue, inbox, delivery, AI, usage, and reporting only; it does not import, schedule, run workers, reply, retry, prompt, execute reports, export, mutate records, call providers, bill, notify, expose secrets, or enable live features.

Demo operations review is available at `/settings/demo`. It renders seeded demo readiness, workflow links, local metrics, usage totals, and runtime gates only; it does not import data, schedule campaigns, run workers, create inbox replies, execute reports, export data, mutate records, call providers, bill, notify, expose secrets, or enable live features.

Operations index review is available at `/settings/operations`. It renders grouped links to existing local operator surfaces and safety boundaries only; it does not execute commands, inspect files, call APIs, mutate records, create exports, call providers, bill, notify, expose secrets, or enable live features.

Release operations review is available at `/settings/releases`. It renders local release checklist commands, protected gate expectations, seeded demo path, premerge metadata, and release surface links only; it does not execute commands, run migrations, launch tests or browsers, perform git operations, deploy, mutate records, call providers, bill, notify, expose logs, diffs, environment values, or secrets, or enable live features.

Health operations review is available at `/settings/health`. It renders the local health endpoint contract, demo-safe defaults, runtime blockers, and operations links only; it does not execute probes, call APIs, run commands, mutate records, call providers, bill, notify, expose raw environment values or secrets, or enable live features.

Campaign operations review is available at `/settings/campaigns`. It renders existing campaign status, recipient counts, queue job state, and worker boundaries only; it does not schedule campaigns, run workers, mutate queue rows, call providers, bill, notify, send SMS, or enable live messaging.

Queue operations review is available at `/settings/queue`. It renders scheduled job timing, due/future status, payload validity, worker settings, queue backend metadata, and idempotency keys only; it does not enqueue jobs, run workers, mutate queue rows, update campaigns, call Redis, call providers, bill, notify, send SMS, or enable live messaging.

Contact operations review is available at `/settings/contacts`. It renders existing consent status, CSV import state, tag counts, list counts, and recent contact metadata only; it does not import contacts, update consent, mutate labels, call providers, bill, notify, send SMS, or enable live messaging.

Data operations review is available at `/settings/data`. It renders tenant-scoped local record totals, soft-archive state, import ledger totals, retention signals, and recent archived contact metadata only; it does not hard-delete or restore records, run exports, mutate data, call providers, bill, notify, call live AI, send SMS, expose secrets, or enable live features.

Audience operations review is available at `/settings/audience`. It renders existing tags, lists, saved segment definitions, and segment timestamps only; it does not change memberships, evaluate segments for sends, call providers, bill, notify, send SMS, or enable live messaging.

Template operations review is available at `/settings/templates`. It renders existing message template variables, campaign usage, and text previews only; it does not create templates, edit copy, render live outbound messages, schedule campaigns, call providers, bill, notify, send SMS, or enable live messaging.

Inbox operations review is available at `/settings/inbox`. It renders existing conversation status, assignment counts, recent message metadata, and shared inbox boundaries only; it does not create messages, assign or resolve conversations, mutate contacts, call providers, bill, notify, send SMS, or enable live messaging.

Webhook operations review is available at `/settings/webhooks`. It renders Twilio webhook route coverage, stored local webhook counts, event-type summaries, recent idempotency keys, and webhook boundaries only; it does not replay payloads, create webhook events, mutate messages or contacts, call providers, bill, notify, send replies, send SMS, expose secrets, or enable live messaging.

Delivery operations review is available at `/settings/delivery`. It renders existing message direction counts, delivery status metadata, provider status labels, provider message ID presence, campaign/conversation context, and recent idempotency keys only; it does not send SMS, retry deliveries, replay webhooks, mutate messages, call providers, bill, notify, expose secrets, or enable live messaging.

Team operations review is available at `/settings/team`. It renders existing organization metadata, membership role/status counts, assigned conversation counts, authored note counts, and member metadata only; it does not invite users, change roles, suspend members, delete memberships, call Clerk, email, notify, call providers, bill, send SMS, or enable live messaging.

Billing operations review is available at `/settings/billing`. It renders existing local billing account status, live billing blockers, Stripe placeholder presence, usage totals, and recent usage metadata only; it does not call Stripe, create subscriptions or invoices, collect payment methods, charge cards, email, notify, call providers, send SMS, or enable live billing.

AI operations review is available at `/settings/ai`. It renders selected AI provider state, fake-provider readiness, deterministic endpoint coverage, local AI usage totals, and recent AI usage metadata only; it does not submit prompts, call live AI, create paid model requests, mutate conversations, create billing artifacts, notify, call providers, send SMS, expose secrets, or enable live AI.

Notification operations review is available at `/settings/notifications`. It renders email, in-app, SMS alert, and webhook notification no-send boundaries only; it does not create recipients, templates, jobs, sends, alerts, webhooks, provider calls, bill, call live AI, notify, email, send SMS, mutate records, expose secrets, or enable live features.

Readiness audit review is available at `/settings/readiness-audit`. It renders tenant-scoped local go-live readiness audit events, filters, and bounded CSV export links; it does not mutate audit events, expose secrets, call providers, bill, call live AI, notify, email, send SMS, or enable live features.

Contract operations review is available at `/settings/contracts`. It renders static contract inventory, validation command references, drift controls, and safety-boundary text only; it does not execute checks, scan files, mutate records, call providers, bill, call live AI, notify, email, send SMS, expose secrets, or enable live features.

Validation operations review is available at `/settings/validation`. It renders static local gate inventory, repair signals, and validation safety-boundary text only; it does not execute commands, inspect logs, scan files, mutate records, call providers, bill, call live AI, notify, email, send SMS, expose secrets, or enable live features.

API operations review is available at `/settings/api`. Its static route inventory is covered by unit tests so implemented local API methods stay visible while external-impact routes remain zero.

Compliance readiness detail is available at `/settings/compliance`. It renders existing profile fields, checklist status, A2P metadata status, and live-message blockers only; it does not update records, verify provider registration, call providers, or enable live messaging.

Provider number metadata is available at `/settings/numbers`. It renders existing local number rows only; it does not provision numbers, verify provider ownership, call Twilio, mutate records, or enable live messaging.

The root route `/` is a local launch dashboard with demo-safe defaults and links to the seeded demo, go-live readiness, provider metadata, system status, usage, and admin export views.

Local operator procedures are documented in `docs/LOCAL_OPERATOR_RUNBOOK.md`; `npm run operator:check` verifies the runbook and is included in `npm run validate`.

The same local-only operator checklist is visible at `/settings/runbook`. It displays commands, safety boundaries, and links to current local admin views only; it does not execute commands or create side effects.

The read-only `/settings/system` page summarizes local safety defaults, runtime markers, queue backend metadata, worker limits, and API rate-limit policy without mutations or external side effects.

Environment operations review is available at `/settings/environment`. It renders demo-safe defaults, allowlisted configuration categories, and derived runtime status only; it does not read environment files, expose raw values or secrets, mutate configuration, call providers, bill, notify, send SMS or email, or enable live features.
