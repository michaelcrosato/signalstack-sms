# Demo Mode

Demo mode is the default. Demo mode uses the dummy messaging provider and fake AI provider. It must not require Twilio, Stripe, Clerk secrets, real phone numbers, or paid AI calls.

Demo provider phone-number records are local metadata only. They are suitable for setup screens and seeded demos, but they do not provision or verify live provider numbers.

The provider numbers screen at `/settings/numbers` displays existing local number metadata, default-number markers, provider labels, statuses, and capabilities. It is read-only and does not provision numbers, verify provider ownership, mutate metadata, call providers, create billing records, send notifications, or enable live messaging.

Demo provider credential records are redacted local readiness metadata only. The seed contains no raw provider token, does not verify anything with Twilio, and does not enable live messaging.

Demo provider credential rotation history is also local metadata only. Seeded history uses redacted values and configured booleans so readiness screens can show and export change history without raw secrets or provider calls.

Seeded campaign delivery evidence is local `Message` metadata only. The demo seed includes delivered, pending, and failed outbound examples with dummy-style provider IDs and a local failed-message provider error code so dashboard, campaign, analytics, and delivery-review screens show realistic evidence without sending SMS, running workers, replaying webhooks, calling providers, billing, notifying, or enabling live messaging.

The provider details screen can configure, rotate, clear, or CSV-export demo Twilio credential metadata history through local API routes. This is a readiness record only: submitted values are reduced to redacted identifiers and token fingerprints, raw auth tokens and fingerprints are not shown after submission or export, and no provider verification, live sending, billing, or provider-side revocation occurs.

Clearing provider metadata from the demo UI requires confirming that the action affects local readiness metadata only and does not revoke provider-side credentials.

The go-live readiness screen can link to a local CSV export of readiness audit events. This export is tenant-scoped demo/admin metadata only and does not call providers, send notifications, create billing records, or enable live messaging.

The compliance detail screen at `/settings/compliance` displays the existing compliance profile, checklist completeness, A2P metadata status, and hard-gate blockers. It is read-only and does not verify registration with providers, update records, send notifications, create billing records, or enable live messaging.

The admin exports screen consolidates local CSV links for readiness audit events and provider credential rotation history. Its local admin navigation is projected from the shared local operator surface inventory so exports navigation stays aligned with `/`, `/demo`, `/settings`, `/settings/operations`, and `/settings/runbook`. It is read-only and does not create exports through a background job, call providers, expose raw secrets, send notifications, create billing records, or enable live messaging.

The usage and analytics screen at `/settings/usage` displays local tenant-scoped metrics, billing boundary status, and recent usage events. It is read-only and does not call Stripe, create billing provider artifacts, send notifications, call providers, or enable live messaging.

The reporting index screen at `/settings/reports` displays existing local reporting surfaces, tenant-scoped analytics counts, local usage totals, recent readiness signals, and reporting safety boundaries. It is read-only and does not execute reports, create exports, mutate records, call providers, call Stripe, call live AI, send notifications, send SMS, email, expose secrets, or enable live features.

The integration operations screen at `/settings/integrations` displays existing local provider, provider-number, webhook, AI, billing, and notification boundaries. It is read-only and does not call providers, submit prompts, call live AI, call Stripe, send notifications, send SMS, email, emit outbound webhooks, expose secrets, mutate records, enqueue jobs, create exports, or enable live features.

The workflow operations screen at `/settings/workflows` displays existing local demo workflow checkpoints across audience intake, campaign readiness, queue handoff, inbox response, delivery evidence, AI, usage, and reporting. It is read-only and does not import contacts, schedule or cancel campaigns, run workers, create inbox replies, retry deliveries, submit prompts, execute reports, create exports, mutate records, enqueue jobs, call Redis, call providers, bill, notify, expose secrets, or enable live features.

The demo operations screen at `/settings/demo` displays seeded demo readiness, workflow links, local metrics, usage totals, and runtime gates. Its checkpoint signals and operational links are projected from the shared local operator surface inventory so the page stays aligned with `/`, `/demo`, `/settings`, `/settings/operations`, and `/settings/runbook`. It is read-only and does not import contacts, schedule or cancel campaigns, run workers, create inbox replies, submit prompts, execute reports, create exports, mutate records, enqueue jobs, call Redis, call providers, bill, notify, expose secrets, or enable live features.

The operations index screen at `/settings/operations` displays grouped links to existing local operator surfaces, static surface counts, and safety boundaries. It is read-only and does not execute commands, inspect files, call APIs, mutate records, create exports, enqueue jobs, call Redis, call providers, call Stripe, call live AI, send notifications, send SMS or email, expose secrets, or enable live features.

The operations index inventory is shared with unit coverage so local operator surface counts, duplicate routes, backing app pages, reverse coverage for implemented operator pages, and safety-sensitive links are checked before the seeded browser demo path runs. The seeded browser path also verifies that `/settings/operations` renders visible labels and routes from the same shared inventory.

The `/settings/runbook` admin-link list is derived from that same shared local operator surface inventory, excluding only non-settings surfaces, so runbook navigation stays aligned with `/settings/operations`.

The `/settings` go-live readiness navigation is also projected from the shared local operator surface inventory, excluding the current page and non-settings surfaces, so readiness navigation stays aligned with operations and runbook surfaces. The seeded investor demo path verifies those browser-visible labels and link targets from the same inventory.

The root launch dashboard is projected from the full shared local operator surface inventory, including `/demo` and `/settings`, so new local operator surfaces appear in the launch view when they are added to the shared inventory. The `/demo` console navigation is projected from the same inventory while excluding only the current `/demo` self-link, so admin export and future local operator surfaces stay visible in the demo console. The root browser smoke test plus seeded demo-console, demo-operations, and operations-index browser checks use the same inventory to verify visible links without duplicating labels.

The release operations screen at `/settings/releases` displays local release checklist commands, protected gate expectations, seeded demo path, premerge metadata, release surface links, and runtime safety boundaries. It is read-only and does not execute commands, run migrations, launch tests or browsers, perform git operations, deploy, mutate records, enqueue jobs, call Redis, call providers, bill, notify, expose logs, diffs, environment values, or secrets, or enable live features.

The health operations screen at `/settings/health` displays the existing local health endpoint contract, demo-safe defaults, runtime blockers, and local operations links. It is read-only and does not execute probes, call APIs, run commands, mutate records, expose raw environment values or secrets, call providers, bill, notify, send SMS or email, or enable live features.

The environment operations screen at `/settings/environment` displays demo-safe defaults, allowlisted configuration categories, and derived runtime status. It is read-only and does not read environment files, expose raw values or secrets, mutate configuration, execute commands, call APIs, call Redis, call providers, bill, notify, send SMS or email, deploy, or enable live features.

The campaign operations screen at `/settings/campaigns` displays existing local campaign status, recipient counts, scheduled campaign metadata, and queue job status. It is read-only and does not schedule campaigns, run workers, mutate queue rows, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The queue operations screen at `/settings/queue` displays scheduled-campaign queue job counts, due/future timing, payload validity, idempotency keys, worker poll settings, queue backend metadata, and Redis presence. It is read-only and does not enqueue jobs, run workers, mutate queue rows, update campaigns, call Redis, call providers, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.

The contact operations screen at `/settings/contacts` displays existing local contact consent counts, CSV import status, tag counts, list counts, and recent contact/import metadata. It is read-only and does not import contacts, update consent, mutate tags or lists, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The data operations screen at `/settings/data` displays tenant-scoped local record totals, active and archived contact counts, import row totals, retention signals, and recent archived contact metadata. It is read-only and does not hard-delete records, restore archived contacts, run exports, mutate records, call providers, create billing records, send notifications, send SMS, call live AI, expose secrets, or enable live features.

The audience operations screen at `/settings/audience` displays existing local tag counts, list member counts, saved segment definitions, and segment update timestamps. It is read-only and does not create tags, update lists, change contact memberships, evaluate segments for sends, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The template operations screen at `/settings/templates` displays existing local message template counts, variable names, campaign usage, and text previews. It is read-only and does not create templates, edit copy, render live outbound messages, schedule campaigns, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The inbox operations screen at `/settings/inbox` displays existing local conversation status, assignment counts, recent message and note counts, and shared inbox safety boundaries. It is read-only and does not create messages, assign conversations, resolve threads, mutate contacts or consent, call providers, create billing records, send notifications, send SMS, or enable live messaging.

The webhook operations screen at `/settings/webhooks` displays existing local Twilio webhook route coverage, stored webhook counts, event-type summaries, recent idempotency keys, and webhook safety boundaries. It is read-only and does not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.

Its navigation links are projected from the shared local operator surface inventory so webhook navigation stays aligned with the demo console, readiness, inbox, delivery, system, and runbook surfaces.

The delivery operations screen at `/settings/delivery` displays existing local message direction counts, delivery metadata, provider status labels, provider message ID presence, campaign/conversation context, and recent idempotency keys. Its navigation links are projected from the shared local operator surface inventory so delivery navigation stays aligned with the demo console, readiness, campaign, queue, inbox, and webhook surfaces. It is read-only and does not send SMS, retry deliveries, replay webhooks, mutate messages, call providers, create billing records, send notifications, expose secrets, or enable live messaging.

The team operations screen at `/settings/team` displays existing local organization metadata, membership role and status counts, assigned conversation counts, authored internal-note counts, and member metadata. It is read-only and does not invite users, create users, change roles, suspend members, delete memberships, call Clerk, send email, send notifications, call providers, create billing records, send SMS, or enable live messaging.

Its navigation links are projected from the shared local operator surface inventory so team navigation stays aligned with the demo console, readiness, campaign, contact, inbox, system, and runbook surfaces.

The billing operations screen at `/settings/billing` displays existing local billing account status, live billing gate status, Stripe placeholder presence, usage-event totals, and recent usage metadata. It is read-only and does not call Stripe, create subscriptions, create invoices, collect payment methods, charge cards, send email, send notifications, call providers, send SMS, or enable live billing.

The AI operations screen at `/settings/ai` displays the selected AI provider, fake-provider readiness, deterministic AI endpoint coverage, local AI usage totals, and recent AI usage metadata. It is read-only and does not submit prompts, call live AI, create paid model requests, mutate conversations, create billing artifacts, send notifications, call providers, send SMS, expose secrets, or enable live AI.

Billing and AI operations navigation links are projected from the shared local operator surface inventory so those pages stay aligned with the demo console, readiness, usage, reporting, system, runbook, and each other without duplicating route lists.

Provider, number, compliance, system, usage, and readiness-audit operation navigation links are projected from the shared local operator surface inventory so those pages stay aligned with readiness, exports, integration, runtime, and reporting surfaces without duplicating route lists. Unit and seeded browser coverage verify labels and route targets without provider calls, provisioning, compliance mutation, audit mutation, billing, notifications, SMS, email, secrets, or live feature enablement.

The notification operations screen at `/settings/notifications` displays email, in-app, SMS alert, and webhook notification boundaries plus no-send controls and runtime gate status. It is read-only and does not create recipients, subscriptions, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, notifications, SMS, email, mutations, expose secrets, or enable live features.

The contract operations screen at `/settings/contracts` displays static contract inventory, drift controls, validation command references, and safety-boundary text. It is read-only and does not read contract file contents, execute checks, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.

The validation operations screen at `/settings/validation` displays static local gate inventory, repair signals, no-impact summary states, and validation safety-boundary text. It is read-only and does not execute commands, inspect logs, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.

The security operations screen at `/settings/security` displays static security controls, validation command references, no-impact summary states for command execution, external impact, mutation, and secret display, and security safety-boundary text. It is read-only and does not scan files, inspect environment values, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.

The API operations inventory is unit-tested so listed local API route-method rows stay unique, point at implemented `app/**/route.ts` files, include every implemented local API route method, and keep live test SMS as the only external-impact route.

The root route `/` is a static local launch dashboard. It shows the demo-safe runtime defaults and shared-inventory links to the existing demo, readiness, provider metadata, system status, usage, and admin export views without requiring database access or creating side effects.

The integration operations surface list, security operations navigation, and environment/health/contract/validation operation links are also projected from the shared local operator surface inventory. Unit and seeded browser coverage verify their visible labels, route targets, notes, states, and boundaries without calling providers, billing, notifications, live AI, SMS, email, commands, exports, mutations, secrets, or live feature enablement.

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
