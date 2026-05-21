# Testing Contract

Owner: tests-quality.

Milestone 0 required tests:

- Vitest smoke test for demo-safe defaults and fake integrations.
- Playwright smoke test for the minimal home page.
- Validation command that runs contracts, safety checks, lint, typecheck, Prisma validate/generate, tests, E2E smoke, and build.

Milestone 10 hardening:

- `npm run contracts:check` must fail when an implemented API route/method pair is missing from either `contracts/CONTRACT-API.md` or `docs/API_MAP.md`.
- `npm run contracts:check` must fail when a tenant-scoped Prisma model loses its `orgId` field.
- `npm run test:e2e:demo` is the explicit seeded-database investor demo path and remains separate from the default validation gate.

Post-MVP local operations status:

- Unit tests must verify that the system-status helper reports demo-safe defaults as external-impact blocked.
- Unit tests must verify that the shared operations-index inventory keeps all grouped local operator surfaces on app routes, has no duplicate routes, points every listed surface at an implemented `app/**/page.tsx`, lists every implemented local operator page, and includes current safety-sensitive surfaces such as release, health, environment, provider, readiness-audit, notification, and security operations.
- Unit tests must verify that the operator runbook admin-link projection is derived from the same shared operations inventory, excludes only non-settings surfaces, keeps labels aligned, and points every runbook link at an implemented `app/**/page.tsx`.
- Unit tests must verify that the go-live readiness page navigation is projected from the same shared operations inventory, excludes the current `/settings` page and non-settings surfaces, and points every projected link at an implemented `app/**/page.tsx`.
- Unit tests must verify that the root launch dashboard is projected from the full shared operations inventory, includes `/demo` and `/settings`, and points every projected link at an implemented `app/**/page.tsx`.
- Unit tests must verify that the `/demo` console navigation is projected from the shared operations inventory, excludes only its own `/demo` self-link, includes `/settings/exports`, and points every projected link at an implemented `app/**/page.tsx`.
- Unit tests must verify that `/settings/demo` readiness checkpoint signals and operational links are projected from the shared operations inventory and point at implemented `app/**/page.tsx` files.
- The Playwright smoke test must verify the root launch dashboard's visible links from the same shared operations inventory instead of a duplicated hard-coded browser list.
- The seeded investor demo path must verify that `/demo` renders visible console navigation from the same shared operations inventory instead of a duplicated hard-coded browser list.
- The seeded investor demo path must verify that `/settings/operations` renders grouped local operator surfaces, visible links/routes from the shared operations inventory, and safety-boundary text without command execution, file inspection, API probes, mutations, exports, provider calls, billing records, notifications, live AI, SMS, email, secret exposure, or live feature enablement.
- The seeded investor demo path must verify that `/settings/demo` renders seeded demo readiness, runtime gates, local seed/scenario signals, and safety-boundary text without imports, campaign scheduling, worker execution, inbox replies, report execution, exports, mutations, provider calls, billing records, notifications, live feature enablement, or secrets.
- The seeded investor demo path must verify that `/settings/system` renders read-only safety, runtime, queue, and API protection metadata.
- The seeded investor demo path must verify that `/settings/health` renders read-only health endpoint contract, demo-safe defaults, runtime boundary, operational links, and safety-boundary text without health probes, API calls, commands, mutations, provider calls, billing, notifications, secrets, or live feature enablement.
- The seeded investor demo path must verify that `/settings/runbook` keeps current local admin surface links visible, including queue operations, delivery operations, readiness audit, and provider numbers, without executing commands or creating external-impact side effects.

Post-MVP deployment platform notes:

- `npm run platform:check` must verify that `docs/DEPLOYMENT_PLATFORM_NOTES.md` documents demo-safe hosting defaults, production gate usage, smoke routes, worker boundaries, and no-external-impact platform constraints.
- `npm run validate` must include `npm run platform:check`.

Post-MVP local usage view:

- The seeded investor demo path must verify that `/settings/usage` renders local usage totals, billing boundary status, and recent usage events without requiring live billing or provider configuration.

Post-MVP provider numbers view:

- The seeded investor demo path must verify that `/settings/numbers` renders read-only local number metadata and its safety boundary without provisioning numbers, calling providers, or enabling live messaging.

Post-MVP campaign operations view:

- The seeded investor demo path must verify that `/settings/campaigns` renders read-only campaign status, queue status, and safety-boundary metadata without scheduling campaigns, running workers, calling providers, billing, sending notifications, mutating queue rows, or enabling live messaging.

Post-MVP queue operations view:

- The seeded investor demo path must verify that `/settings/queue` renders read-only scheduled job timing, queue status, worker boundary, payload validity, and safety-boundary metadata without enqueueing jobs, running workers, calling Redis, calling providers, billing, sending notifications, mutating queue rows, updating campaigns, or enabling live messaging.

Post-MVP contact operations view:

- The seeded investor demo path must verify that `/settings/contacts` renders read-only consent status, import status, recent contact metadata, and safety-boundary text without importing contacts, mutating consent, changing labels, calling providers, billing, sending notifications, or enabling live messaging.

Post-MVP audience operations view:

- The seeded investor demo path must verify that `/settings/data` renders read-only local data operations metadata, soft-archive counts, import ledger totals, retention signals, and safety-boundary text without hard deletion, record mutation, provider calls, billing, notifications, live AI, SMS, or live feature enablement.

- The seeded investor demo path must verify that `/settings/audience` renders read-only tag, list, saved segment, and safety-boundary text without changing memberships, evaluating segments for campaign sends, calling providers, billing, sending notifications, mutating contact labels, or enabling live messaging.

Post-MVP template operations view:

- The seeded investor demo path must verify that `/settings/templates` renders read-only template variable coverage, recent template previews, campaign usage, and safety-boundary text without creating templates, editing copy, rendering live outbound messages, scheduling campaigns, calling providers, billing, sending notifications, or enabling live messaging.

Post-MVP inbox operations view:

- The seeded investor demo path must verify that `/settings/inbox` renders read-only conversation status, recent conversation metadata, and safety-boundary text without creating messages, assigning conversations, resolving conversations, calling providers, billing, sending notifications, mutating contacts, or enabling live messaging.

Post-MVP team operations view:

- The seeded investor demo path must verify that `/settings/team` renders read-only organization metadata, membership role/status counts, recent member metadata, and safety-boundary text without inviting users, changing roles, suspending members, deleting memberships, calling Clerk, emailing, sending notifications, calling providers, billing, sending SMS, or enabling live messaging.

Post-MVP billing operations view:

- The seeded investor demo path must verify that `/settings/billing` renders read-only local billing account status, live billing blocker status, usage totals, recent usage metadata, and safety-boundary text without Stripe calls, subscription creation, invoices, payment collection, card charges, email, notifications, provider calls, SMS, or live billing enablement.

Post-MVP AI operations view:

- The seeded investor demo path must verify that `/settings/ai` renders read-only fake-provider status, deterministic endpoint coverage, recent local AI usage metadata, and safety-boundary text without prompt submission, live AI calls, paid model requests, billing artifacts, notifications, provider calls, SMS, or live AI enablement.

Post-MVP reporting index view:

- The seeded investor demo path must verify that `/settings/reports` renders a read-only local reporting index with report links, operational metrics, readiness signals, and safety-boundary text without executing reports, creating exports, mutating records, provider calls, billing, live AI, SMS, email, notifications, secret exposure, or live feature enablement.

Post-MVP integration operations view:

- The seeded investor demo path must verify that `/settings/integrations` renders read-only provider, AI, billing, webhook, and notification integration boundaries without provider calls, prompt submission, billing artifacts, notifications, mutations, secret exposure, enqueueing, exports, or live feature enablement.

Post-MVP workflow operations view:

- The seeded investor demo path must verify that `/settings/workflows` renders read-only workflow checkpoints, runtime boundaries, operational signals, and safety-boundary text without imports, campaign scheduling, worker execution, inbox replies, delivery retries, prompt submission, report execution, exports, mutations, provider calls, billing, notifications, or live feature enablement.

Post-MVP release operations view:

- The seeded investor demo path must verify that `/settings/releases` renders read-only release checklist, runtime boundary, release surface links, and safety-boundary text without command execution, migrations, tests, browser launches, git operations, deploys, mutations, provider calls, billing, notifications, secrets, or live feature enablement.

Post-MVP notification operations view:

- The seeded investor demo path must verify that `/settings/notifications` renders read-only notification channel boundaries, no-send controls, runtime gates, and safety-boundary text without creating recipients, subscriptions, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, SMS, email, mutations, or notification delivery.

Post-MVP readiness audit operations view:

- The seeded investor demo path must verify that `/settings/readiness-audit` renders tenant-scoped local readiness audit events, action/subject filters, a bounded CSV export link, and safety-boundary text without mutating audit events, exposing secrets, calling providers, billing, live AI, SMS, email, notifications, or enabling live features.

Post-MVP contract operations view:

- The seeded investor demo path must verify that `/settings/contracts` renders read-only contract inventory, validation commands, drift controls, and safety-boundary text without reading contract file contents, executing checks, scanning files, mutating records, provider calls, billing records, live AI calls, SMS, email, notifications, secret exposure, or live feature enablement.

Post-MVP validation operations view:

- The seeded investor demo path must verify that `/settings/validation` renders read-only local validation gate inventory, repair signals, and safety-boundary text without executing commands, inspecting logs, scanning files, mutating records, provider calls, billing records, live AI calls, SMS, email, notifications, secret exposure, or live feature enablement.

Post-MVP API operations inventory:

- Unit tests must keep the static `/settings/api` route inventory aligned with implemented local API methods, including soft archive, draft update, inbox read endpoints, and billing usage reads.
- Unit tests must fail when a listed API route path has no backing `app/**/route.ts` file or when route-method rows are duplicated.
- Unit tests must fail when an implemented local API route method under `app/api/**/route.ts` is missing from the static `/settings/api` inventory.
- The inventory must continue to report zero external-impact routes until future live SMS, billing, notification, provider, or AI gates are designed and tested.

Post-MVP webhook operations view:

- The seeded investor demo path must verify that `/settings/webhooks` renders read-only Twilio route coverage, event-type summaries, recent local webhook metadata, and safety-boundary text without webhook replay, provider calls, outbound replies, message/contact mutation, notifications, billing records, SMS, or live messaging enablement.

Post-MVP delivery operations view:

- The seeded investor demo path must verify that `/settings/delivery` renders read-only message direction counts, delivery status metadata, provider status labels, recent message metadata, and safety-boundary text without sends, retries, webhook replays, provider calls, message mutation, notifications, billing records, SMS, or live messaging enablement.
