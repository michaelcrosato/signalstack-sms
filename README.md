# SignalStack SMS

SignalStack SMS is a demo-safe SMB SMS/MMS SaaS repo. The current implementation has strong backend, contract, validation, seed, worker, provider metadata, and operations foundations. The next major product priority is a polished browser workflow for contacts, campaigns, inbox, templates, analytics, and compliance.

The only intentional live external-impact path today is the isolated `/demo` live-test SMS form. It remains hard-gated by explicit Twilio credentials, live flags, a recipient allowlist, and the confirmation phrase. Live campaign sending, live billing, live AI, production auth, and production deployment are not enabled.

The product workspace starts at `/dashboard`. Deeper product routes now include `/dashboard/contacts` for local audience review/import plus archived contact restore links, `/dashboard/contacts/:contactId` for local profile, consent, soft-archive, restore, and duplicate-merge editing, `/dashboard/campaigns` for draft composition, recipient selection, compliance preflight, and local scheduling, `/dashboard/campaigns/:campaignId` for local draft edits and queued-campaign cancellation, `/dashboard/inbox` for local conversation review, demo inbound replies, notes, assignment, and resolve/reopen workflow, `/dashboard/templates` for reusable local copy creation, `/dashboard/templates/:templateId` for local template detail/edit, `/dashboard/analytics` for local overview detail, and `/dashboard/compliance` for readiness review through existing APIs without SMS, provider, billing, or live-AI side effects.

## Current roadmap

- `PLAN.md` is the short operational roadmap.
- `docs/CURRENT_STATE_MATRIX.md` is the quick reality check by product area.
- `planning/CONSENSUS-2026-05-21.md` summarizes Claude, Gemini, Grok, and Codex planning input.
- `docs/CANONICAL_IMPLEMENTATION_PLAN.md` remains the governing implementation contract.

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

Playwright uses `127.0.0.1:3100` by default so browser checks do not collide with a normal `npm run dev` session on port 3000. Override with `PLAYWRIGHT_PORT=<port>` when needed; reuse of an already running server is explicit with `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`.

Investor demo path:

```bash
npm run test:e2e -- e2e/demo-path.spec.ts --project=chromium
```

Seeded product dashboard, contacts, campaign, campaign detail, inbox, template, analytics, and compliance path:

```bash
npm run test:e2e:product-demo
```

All flows remain local/demo-only unless future hard gates explicitly enable live providers.

Scheduled campaign workers are also local/demo-only. The database worker and optional BullMQ worker require dummy provider mode, live messaging disabled, and no production-like runtime marker. Unit coverage pins every production-like runtime marker (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, and `APP_ENV`) so those blocks happen before provider or live-worker-class checks can fall through.

Production-like demo deployment is documented in `docs/PRODUCTION_GO_LIVE.md`. The current gate permits demo-safe production deployments only and keeps live SMS, billing, provider calls, and live AI blocked by default.

Production worker policy is documented in `docs/PRODUCTION_WORKER_POLICY.md`. It is a future live-send planning gate only; current production-like demo deployments do not run scheduled campaign workers. Worker readiness accepts only an unset `WORKER_DEPLOYMENT_CLASS` or `WORKER_DEPLOYMENT_CLASS=local-demo`; any production/live class remains blocked, including the reserved `production-live-campaign` class. The future `production-live-campaign` controls are pinned as frozen metadata in `lib/queue/live-worker-controls.ts`, and unsupported classes deny before supplied controls are inspected. The reserved class cannot be authorized until the supplied control array and entries are frozen data descriptors, the array exposes only indexed data entries plus its native `length`, and every listed control is implemented.

Deployment platform notes are documented in `docs/DEPLOYMENT_PLATFORM_NOTES.md`; `npm run platform:check` verifies that demo-safe hosting boundaries remain documented and is included in `npm run validate`.

Production observability planning is documented in `docs/PRODUCTION_OBSERVABILITY.md`. Current observability guidance is local/platform-only and does not add third-party telemetry, notifications, live providers, or billing side effects.

Local usage and analytics review is available at `/settings/usage`. It renders existing tenant-scoped metrics and usage events only; it does not call Stripe, create billing provider artifacts, call providers, send notifications, or enable live messaging.

Reporting index review is available at `/settings/reports`. It renders existing local reporting surfaces, tenant metrics, export links, and readiness signals only; it does not execute reports, create exports, mutate records, call providers, bill, notify, expose secrets, or enable live features.

Admin exports review is available at `/settings/exports`. Its navigation is projected from the shared local operator surface inventory and it links only to bounded local CSV endpoints; it does not create background exports, mutate records, call providers, bill, notify, expose secrets, or enable live features.

Integration operations review is available at `/settings/integrations`. It renders existing provider, number, webhook, AI, billing, and notification boundaries only; it does not call providers, submit prompts, call live AI, call Stripe, notify, send SMS or email, mutate records, enqueue jobs, expose secrets, export data, or enable live features.

Security operations review is available at `/settings/security`. Its control inventory, runtime-frozen validation command vocabulary, validation command references, supported package-script references, runtime-frozen local-only status and no-impact vocabularies for command execution, external impact, mutation, and secret display, caller-mutation rejection for exported vocabularies, detached returned arrays with aligned counts, safety boundaries, whitespace-clean copy, secret-like literal guard, and command-like literal guard outside the allowlisted validation-command field are validated static metadata before render; it does not scan files, read raw environment values, reveal secrets, mutate records, call providers, call live AI, call Stripe, send SMS, email, or notifications, disable rate limits, or enable live features.

Notification operations review is available at `/settings/notifications`. Its channel boundaries, runtime-frozen exported vocabularies with caller-mutation rejection, detached returned arrays with aligned counts, channel-specific boundary terms, status vocabulary, no-impact summary vocabulary for command execution, external impact, mutation, and secret display, no-send controls, safety-boundary copy, public fields, frozen snapshots, stable order, unique identifiers, required no-send control terms, whitespace-clean copy, secret-like literal guard, and command-like literal guard are validated static metadata before render; it does not create recipients, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, notifications, SMS, email, mutations, secrets, or live feature enablement.

Workflow operations review is available at `/settings/workflows`. It renders existing demo workflow checkpoints across audience, campaigns, queue, inbox, delivery, AI, usage, and reporting only; it does not import, schedule, run workers, reply, retry, prompt, execute reports, export, mutate records, call providers, bill, notify, expose secrets, or enable live features.

Demo operations review is available at `/settings/demo`. It renders seeded demo readiness, shared-inventory workflow links, local metrics, usage totals, and runtime gates only; it does not import data, schedule campaigns, run workers, create inbox replies, execute reports, export data, mutate records, call providers, bill, notify, expose secrets, or enable live features.

Operations index review is available at `/settings/operations`. It renders grouped links to existing local operator surfaces and safety boundaries only; it does not execute commands, inspect files, call APIs, mutate records, create exports, call providers, bill, notify, expose secrets, or enable live features.

The operations index route inventory is shared with unit tests and seeded browser coverage so local surface counts, backing app pages, implemented operator pages, duplicate routes, duplicate supplied-inventory routes, invalid supplied-inventory arrays, non-plain supplied-inventory arrays, unsafe or missing supplied-inventory array index descriptors, empty supplied inventories, invalid supplied-inventory group objects, sparse supplied-inventory group entries, invalid supplied-inventory link arrays, non-plain supplied-inventory link arrays, unsafe or missing supplied-inventory link array index descriptors, invalid supplied-inventory link objects, custom-prototype supplied-inventory records, prototype-backed supplied-inventory fields, accessor-backed supplied-inventory fields, non-enumerable supplied-inventory fields, extra supplied-inventory group/link fields, sparse supplied-inventory link entries, non-string supplied-inventory fields, malformed supplied-inventory routes, empty supplied-inventory groups, duplicate supplied-inventory copy, blank supplied-inventory fields, duplicate labels/notes, route-aligned labels/notes, whitespace-clean inventory copy, concise action-neutral navigation copy, stable group/route order, stable projection route order, fresh and frozen projection result arrays, frozen projection result objects across every projection entry, frozen canonical inventory, detached projection link objects, public-field-only projection links, rich objects, public summary aggregates, fresh frozen summary route arrays, full supplied-inventory copy derivation, supplied-inventory route omission handling, supplied-inventory immutability, missing-route projection failures, focused projection reachability, stable label/note copy shape, rich projection labels/routes/copy boundaries, external-impact boundary exclusions, visible labels/routes, and safety-sensitive links fail fast before green handoff.

The shared operator surface inventory is validated before export, then frozen at runtime. It also has route-shape coverage: every listed route must stay lowercase, static, query-free, hash-free, slash-normalized, and limited to `/demo`, `/settings`, or `/settings/**`. Supplied-inventory route-shape failure tests explicitly cover non-local, uppercase, query, hash, trailing-slash, double-slash, and dynamic-segment route variants.

The root launch dashboard, `/demo` console navigation, `/settings/demo` readiness links, `/settings/runbook` admin links, `/settings` go-live readiness navigation, `/settings/reports`, `/settings/workflows`, `/settings/releases`, `/settings/integrations`, `/settings/security`, `/settings/environment`, `/settings/health`, `/settings/contracts`, `/settings/validation`, `/settings/exports`, `/settings/webhooks`, `/settings/delivery`, `/settings/team`, `/settings/billing`, `/settings/ai`, `/settings/provider`, `/settings/numbers`, `/settings/compliance`, `/settings/system`, `/settings/usage`, and `/settings/readiness-audit` link projections are derived from the same shared local operator surface inventory, with unit coverage for launch coverage, demo console coverage, demo operations coverage, reporting/workflow/release coverage, integration/security coverage, environment/health/contract/validation coverage, admin-export coverage, webhook/delivery/team coverage, billing/AI coverage, provider/readiness/runtime coverage, rich demo/workflow/integration projection coverage, unique projected routes, label alignment, page-specific current-route exclusion, and backing app pages. The root Playwright smoke test plus seeded demo-console, demo-operations, reporting, workflow, release, integration, security, environment, health, contract, validation, admin-export, webhook, delivery, team, billing, AI, provider, numbers, compliance, system, usage, readiness-audit, go-live readiness, and operations-index browser checks also read that shared inventory for visible link coverage instead of maintaining separate route lists.

Release operations review is available at `/settings/releases`. It renders local release checklist commands, protected gate expectations, seeded demo path, premerge metadata, and release surface links only; it does not execute commands, run migrations, launch tests or browsers, perform git operations, deploy, mutate records, call providers, bill, notify, expose logs, diffs, environment values, or secrets, or enable live features.

Health operations review is available at `/settings/health`. It renders the local health endpoint contract, demo-safe defaults, runtime blockers, and operations links only; it does not execute probes, call APIs, run commands, mutate records, call providers, bill, notify, expose raw environment values or secrets, or enable live features.

Campaign operations review is available at `/settings/campaigns`. It renders existing campaign status, recipient counts, queue job state, and worker boundaries only; it does not schedule campaigns, run workers, mutate queue rows, call providers, bill, notify, send SMS, or enable live messaging.

Queue operations review is available at `/settings/queue`. It renders scheduled job timing, due/future status, payload validity, worker settings, queue backend metadata, idempotency keys, validated worker command references, and no-impact summary states only; it does not enqueue jobs, run workers, mutate queue rows, update campaigns, call Redis, call providers, bill, notify, send SMS, or enable live messaging. Its static worker command references, runtime-frozen worker command and worker mode vocabularies with caller-mutation rejection, safety-boundary copy, public fields, frozen snapshots, detached returned arrays with aligned counts, stable order, package-script references, secret-like literal guard, command-like literal guard outside the allowlisted command field, and no-impact summary states for command execution, external impact, mutation, and secret display are unit-tested before local queue metadata renders and pinned in the seeded investor demo path.

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

Notification operations review is available at `/settings/notifications`. It renders email, in-app, SMS alert, and webhook notification no-send boundaries, runtime controls, and no-impact summary states only; it does not create recipients, templates, jobs, sends, alerts, webhooks, provider calls, bill, call live AI, notify, email, send SMS, mutate records, expose secrets, or enable live features. Its static channel names, blocked/not-implemented/inbound-only status values, channel-specific boundary terms, and no-impact summary states for command execution, external impact, mutation, and secret display are allowlisted and runtime-frozen before render so new notification surfaces require intentional metadata updates.

Readiness audit review is available at `/settings/readiness-audit`. It renders tenant-scoped local go-live readiness audit events, filters, bounded CSV export links, and no-impact summary labels for command execution, external impact, mutation, and secrets displayed; it does not execute commands, mutate audit events, expose secrets, call providers, bill, call live AI, notify, email, send SMS, or enable live features. Its action filters, subject filters, default-limit vocabulary, bounded positive export-limit vocabulary, CSV export-link helper, command-execution state, safety-boundary copy, no-impact summary states, detached status arrays, and rendered counts are allowlisted and runtime-frozen before render, and the JSON/CSV readiness-audit query schema accepts only those supported action and subject filters while deriving its default and maximum limits from the same operations vocabularies. Unsupported CSV export-link limits are rejected before links render.

Contract operations review is available at `/settings/contracts`. It renders static contract inventory, validation command references, drift controls, and safety-boundary text only; it does not execute checks, scan files, mutate records, call providers, bill, call live AI, notify, email, send SMS, expose secrets, or enable live features. Its inventory is unit-tested for required contract paths, runtime-frozen supported file-path, validation-command, and no-impact vocabularies, command references backed by `package.json` scripts, public fields, frozen snapshots, detached returned arrays with aligned counts, stable order, unique identifiers, whitespace-clean copy, secret-like literal rejection, command-like literal rejection outside the allowlisted validation-command field, visible no-mutation summary rendering, and stable read-only counts.

Validation operations review is available at `/settings/validation`. It renders static local gate inventory, repair signals, validation safety-boundary text, and no-impact summary states only; it does not execute commands, inspect logs, scan files, mutate records, call providers, bill, call live AI, notify, email, send SMS, expose secrets, or enable live features. Its inventory is unit-tested for gate command references backed by `package.json` scripts, runtime-frozen supported gate-command and local-only area vocabularies, repair signals, public fields, frozen snapshots, detached returned arrays with aligned counts, stable order, unique identifiers, required boundary terms, whitespace-clean copy, secret-like literal rejection, command-like literal rejection outside the allowlisted gate-command field, and runtime-frozen no-impact vocabularies for no command execution, no external impact, no mutation, and no secret display.

API operations review is available at `/settings/api`. Its static route inventory is covered by unit tests so implemented local API methods stay visible, duplicate route-method rows fail fast, listed paths have backing `app/**/route.ts` files, implemented route methods have inventory rows, and the explicitly gated live test SMS endpoint remains the only external-impact route.
The API operations inventory is value-shape validated before export, uses runtime-frozen supported method, area, and no-impact vocabularies, derives implemented-route reverse coverage from the exported method vocabulary, is frozen at export, status calls return fresh frozen status, rate-limit, and route snapshots with counts aligned to detached returned route arrays, rate-limit policy metadata is covered at local clamp boundaries, route order is stable for local review pages, and both exported/status snapshots expose only public route/status fields so malformed route metadata, caller-side mutation, accidental order churn, or accidental extra fields cannot drift local API inventory renders. Static route metadata is also guarded against whitespace churn, command-like copy, and secret-like literals before local API inventory renders.

Compliance readiness detail is available at `/settings/compliance`. It renders existing profile fields, checklist status, A2P metadata status, and live-message blockers only; it does not update records, verify provider registration, call providers, or enable live messaging.

Provider number metadata is available at `/settings/numbers`. It renders existing local number rows only; it does not provision numbers, verify provider ownership, call Twilio, mutate records, or enable live messaging.

The root route `/` is a local launch dashboard with demo-safe defaults and links projected from the shared local operator surface inventory, including the seeded demo, go-live readiness, provider metadata, system status, usage, and admin export views.

Local operator procedures are documented in `docs/LOCAL_OPERATOR_RUNBOOK.md`; `npm run operator:check` verifies the runbook and is included in `npm run validate`.

The same local-only operator checklist is visible at `/settings/runbook`. It displays commands, safety boundaries, and links to current local admin views only; it does not execute commands or create side effects.

The read-only `/settings/system` page summarizes local safety defaults, runtime markers, queue backend metadata, worker limits, and API rate-limit policy without mutations or external side effects.

Environment operations review is available at `/settings/environment`. It renders demo-safe defaults, allowlisted configuration categories, and derived runtime status only; it does not read environment files, expose raw values or secrets, mutate configuration, call providers, bill, notify, send SMS or email, or enable live features.
