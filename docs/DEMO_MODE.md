# Demo Mode

Demo mode is the default. Demo mode uses the dummy messaging provider and fake AI provider. It must not require Twilio, Stripe, Clerk secrets, real phone numbers, or paid AI calls.

Demo provider phone-number records are local metadata only. They are suitable for setup screens and seeded demos, but they do not provision or verify live provider numbers.

The provider numbers screen at `/settings/numbers` displays existing local number metadata, default-number markers, provider labels, statuses, and capabilities. It is read-only and does not provision numbers, verify provider ownership, mutate metadata, call providers, create billing records, send notifications, or enable live messaging.

Demo provider credential records are redacted local readiness metadata only. The seed contains no raw provider token, does not verify anything with Twilio, and does not enable live messaging.

Demo provider credential rotation history is also local metadata only. Seeded history uses redacted values and configured booleans so readiness screens can show and export change history without raw secrets or provider calls.

The provider details screen can configure, rotate, clear, or CSV-export demo Twilio credential metadata history through local API routes. This is a readiness record only: submitted values are reduced to redacted identifiers and token fingerprints, raw auth tokens and fingerprints are not shown after submission or export, and no provider verification, live sending, billing, or provider-side revocation occurs.

Clearing provider metadata from the demo UI requires confirming that the action affects local readiness metadata only and does not revoke provider-side credentials.

The go-live readiness screen can link to a local CSV export of readiness audit events. This export is tenant-scoped demo/admin metadata only and does not call providers, send notifications, create billing records, or enable live messaging.

The compliance detail screen at `/settings/compliance` displays the existing compliance profile, checklist completeness, A2P metadata status, and hard-gate blockers. It is read-only and does not verify registration with providers, update records, send notifications, create billing records, or enable live messaging.

The admin exports screen consolidates local CSV links for readiness audit events and provider credential rotation history. It is read-only and does not create exports through a background job, call providers, expose raw secrets, send notifications, create billing records, or enable live messaging.

The usage and analytics screen at `/settings/usage` displays local tenant-scoped metrics, billing boundary status, and recent usage events. It is read-only and does not call Stripe, create billing provider artifacts, send notifications, call providers, or enable live messaging.

The reporting index screen at `/settings/reports` displays existing local reporting surfaces, tenant-scoped analytics counts, local usage totals, recent readiness signals, and reporting safety boundaries. It is read-only and does not execute reports, create exports, mutate records, call providers, call Stripe, call live AI, send notifications, send SMS, email, expose secrets, or enable live features.

The integration operations screen at `/settings/integrations` displays existing local provider, provider-number, webhook, AI, billing, and notification boundaries. It is read-only and does not call providers, submit prompts, call live AI, call Stripe, send notifications, send SMS, email, emit outbound webhooks, expose secrets, mutate records, enqueue jobs, create exports, or enable live features.

The workflow operations screen at `/settings/workflows` displays existing local demo workflow checkpoints across audience intake, campaign readiness, queue handoff, inbox response, delivery evidence, AI, usage, and reporting. It is read-only and does not import contacts, schedule or cancel campaigns, run workers, create inbox replies, retry deliveries, submit prompts, execute reports, create exports, mutate records, enqueue jobs, call Redis, call providers, bill, notify, expose secrets, or enable live features.

The release operations screen at `/settings/releases` displays local release checklist commands, protected gate expectations, seeded demo path, premerge metadata, release surface links, and runtime safety boundaries. It is read-only and does not execute commands, run migrations, launch tests or browsers, perform git operations, deploy, mutate records, enqueue jobs, call Redis, call providers, bill, notify, expose logs, diffs, environment values, or secrets, or enable live features.

The campaign operations screen at `/settings/campaigns` displays existing local campaign status, recipient counts, scheduled campaign metadata, and queue job status. It is read-only and does not schedule campaigns, run workers, mutate queue rows, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The queue operations screen at `/settings/queue` displays scheduled-campaign queue job counts, due/future timing, payload validity, idempotency keys, worker poll settings, queue backend metadata, and Redis presence. It is read-only and does not enqueue jobs, run workers, mutate queue rows, update campaigns, call Redis, call providers, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.

The contact operations screen at `/settings/contacts` displays existing local contact consent counts, CSV import status, tag counts, list counts, and recent contact/import metadata. It is read-only and does not import contacts, update consent, mutate tags or lists, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The data operations screen at `/settings/data` displays tenant-scoped local record totals, active and archived contact counts, import row totals, retention signals, and recent archived contact metadata. It is read-only and does not hard-delete records, restore archived contacts, run exports, mutate records, call providers, create billing records, send notifications, send SMS, call live AI, expose secrets, or enable live features.

The audience operations screen at `/settings/audience` displays existing local tag counts, list member counts, saved segment definitions, and segment update timestamps. It is read-only and does not create tags, update lists, change contact memberships, evaluate segments for sends, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The template operations screen at `/settings/templates` displays existing local message template counts, variable names, campaign usage, and text previews. It is read-only and does not create templates, edit copy, render live outbound messages, schedule campaigns, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The inbox operations screen at `/settings/inbox` displays existing local conversation status, assignment counts, recent message and note counts, and shared inbox safety boundaries. It is read-only and does not create messages, assign conversations, resolve threads, mutate contacts or consent, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The webhook operations screen at `/settings/webhooks` displays existing local Twilio webhook route coverage, stored webhook counts, event-type summaries, recent idempotency keys, and webhook safety boundaries. It is read-only and does not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.

The team operations screen at `/settings/team` displays existing local organization metadata, membership role and status counts, assigned conversation counts, authored internal-note counts, and member metadata. It is read-only and does not invite users, create users, change roles, suspend members, delete memberships, call Clerk, send email, send notifications, call providers, create billing records, send SMS, or enable live messaging.

The billing operations screen at `/settings/billing` displays existing local billing account status, live billing gate status, Stripe placeholder presence, usage-event totals, and recent usage metadata. It is read-only and does not call Stripe, create subscriptions, create invoices, collect payment methods, charge cards, send email, send notifications, call providers, send SMS, or enable live billing.

The AI operations screen at `/settings/ai` displays the selected AI provider, fake-provider readiness, deterministic AI endpoint coverage, local AI usage totals, and recent AI usage metadata. It is read-only and does not submit prompts, call live AI, create paid model requests, mutate conversations, create billing artifacts, send notifications, call providers, send SMS, expose secrets, or enable live AI.

The notification operations screen at `/settings/notifications` displays email, in-app, SMS alert, and webhook notification boundaries plus no-send controls and runtime gate status. It is read-only and does not create recipients, subscriptions, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, notifications, SMS, email, mutations, expose secrets, or enable live features.

The contract operations screen at `/settings/contracts` displays static contract inventory, drift controls, validation command references, and safety-boundary text. It is read-only and does not read contract file contents, execute checks, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.

The validation operations screen at `/settings/validation` displays static local gate inventory, repair signals, and validation safety-boundary text. It is read-only and does not execute commands, inspect logs, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.

The root route `/` is a static local launch dashboard. It shows the demo-safe runtime defaults and links to the existing demo, readiness, provider metadata, system status, usage, and admin export views without requiring database access or creating side effects.

The local operator runbook screen at `/settings/runbook` displays demo-safe validation, seed, worker, export, and repair-loop commands from the local runbook. It is read-only and does not execute commands, mutate records, call providers, create billing records, send notifications, expose secrets, or enable live messaging.

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
