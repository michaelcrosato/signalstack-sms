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
- Playwright browser checks must use a local-only server on `127.0.0.1` and default to a test port separate from the normal dev port. `PLAYWRIGHT_PORT` may override that port with a valid TCP port, and existing-server reuse must remain explicit through `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`.

Post-MVP local operations status:

- Unit tests must verify that the system-status helper reports demo-safe defaults as external-impact blocked.
- Queue worker unit tests must verify that both the database worker and BullMQ worker reject every production-like runtime marker (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, and `APP_ENV`) before provider or future live-worker-class checks can fall through.
- Unit tests must verify that the shared operations-index inventory keeps all grouped local operator surfaces on app routes, has no duplicate routes, points every listed surface at an implemented `app/**/page.tsx`, lists every implemented local operator page, and includes current safety-sensitive surfaces such as release, health, environment, provider, readiness-audit, notification, and security operations.
- Unit tests must verify that the operator runbook admin-link projection is derived from the same shared operations inventory, excludes only non-settings surfaces, keeps labels aligned, and points every runbook link at an implemented `app/**/page.tsx`.
- Unit tests must verify that the go-live readiness page navigation is projected from the same shared operations inventory, excludes the current `/settings` page and non-settings surfaces, and points every projected link at an implemented `app/**/page.tsx`.
- The seeded investor demo path must verify that `/settings` renders browser-visible go-live readiness navigation labels and link targets from the same shared operations inventory instead of a duplicated hard-coded browser list.
- Unit tests must verify that the root launch dashboard is projected from the full shared operations inventory, includes `/demo` and `/settings`, and points every projected link at an implemented `app/**/page.tsx`.
- Unit tests must verify that the `/demo` console navigation is projected from the shared operations inventory, excludes only its own `/demo` self-link, includes `/settings/exports`, and points every projected link at an implemented `app/**/page.tsx`.
- Unit tests must verify that `/settings/demo` readiness checkpoint signals and operational links are projected from the shared operations inventory and point at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/reports`, `/settings/workflows`, and `/settings/releases` project their report links, workflow checkpoint owners, and release surface links from the shared operations inventory and point at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/integrations` integration surface links and `/settings/security` navigation links are projected from the shared operations inventory and point at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/environment`, `/settings/health`, `/settings/contracts`, and `/settings/validation` operation links are projected from the shared operations inventory and point at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/exports` admin navigation is projected from the shared operations inventory and points at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/webhooks`, `/settings/delivery`, and `/settings/team` header navigation is projected from the shared operations inventory and points at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/billing` and `/settings/ai` header navigation is projected from the shared operations inventory and points at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/contacts`, `/settings/campaigns`, `/settings/audience`, `/settings/templates`, `/settings/inbox`, and `/settings/data` header navigation is projected from the shared operations inventory and points at implemented `app/**/page.tsx` files.
- Unit tests must verify that `/settings/provider`, `/settings/numbers`, `/settings/compliance`, `/settings/system`, `/settings/usage`, and `/settings/readiness-audit` header navigation is projected from the shared operations inventory and points at implemented `app/**/page.tsx` files.
- Unit tests must verify that every shared per-page operator navigation projection has unique route entries, points at implemented `app/**/page.tsx` files, and resolves only through the shared operations inventory.
- Unit tests must verify that rich shared operator projections for demo checkpoints, workflow steps, and integration areas keep unique route entries, point at implemented `app/**/page.tsx` files, and derive visible labels from the shared operations inventory.
- Unit tests must verify that rich shared operator projection names, labels, states, and boundaries stay unambiguous, whitespace-clean, and explicit about read-only/no-impact boundaries.
- Unit tests must verify that rich shared operator projection boundaries explicitly name external-impact exclusions such as provider calls, SMS, billing, mutations, exports, queue activity, or paid AI.
- Unit tests must verify that page-specific operator navigation projections exclude their own current route, while broader inventory views such as the runbook may intentionally list all local admin pages.
- Unit tests must verify that the shared operator surface inventory keeps group names, link labels, and link notes unambiguous so projected navigation and browser checks cannot silently collide.
- Unit tests must verify that shared operator surface routes, group names, labels, and notes remain whitespace-clean without leading/trailing whitespace, doubled spaces, or embedded newlines.
- Unit tests must verify that shared operator surface group names and labels stay in stable Title Case navigation format, and notes stay short lower-case sentence fragments without terminal punctuation.
- Unit tests must verify that shared operator surface group names, labels, and notes stay concise for operator scanning, and labels keep predictable navigation suffixes.
- Unit tests must verify that shared operator surface group names, labels, and notes stay action-neutral, avoiding command-style copy such as send, run, delete, enable, replay, or mutate.
- Unit tests must verify that every shared operator surface route remains a canonical static local app-page route: lowercase, no trailing slash, no query/hash, no dynamic segment, no double slash, and limited to `/demo`, `/settings`, or `/settings/**`.
- Unit tests must verify that shared operator surface groups and route order stay stable so projected navigation does not churn without an intentional inventory update.
- Unit tests must verify that every shared operator navigation projection keeps its route order stable so page headers, launch links, demo links, and rich workflow/demo/integration projections do not churn without an intentional inventory update.
- Unit tests must verify that every shared operator navigation projection, plus rich demo/workflow/integration projection labels and notes, derives visible copy from the supplied inventory instance instead of stale global copy.
- Unit tests must verify that broad shared operator inventory projections honor the supplied inventory instance when routes are omitted instead of reintroducing stale global routes.
- Unit tests must verify that shared operator inventory projection helpers do not mutate supplied inventory groups or links while deriving navigation, rich checkpoints, workflow steps, or integration areas.
- Unit tests must verify that shared operator inventory projection helpers return fresh and frozen result arrays per call so caller-side array mutation cannot contaminate later projections.
- Unit tests must verify that shared operator inventory projection helpers return frozen result objects so caller-side link or rich-projection mutation cannot leak back into supplied inventory instances.
- Unit tests must verify every shared operator projection result object is frozen across navigation, demo checkpoint, workflow, and integration projections.
- Unit tests must verify that the canonical shared operator surface inventory is validated before export and frozen at runtime so malformed built-in route groups fail early, and accidental mutation of the exported route groups, nested link arrays, or link copy fails before projection drift can leak into pages.
- Unit tests must verify shared operator projection links are detached objects from supplied inventory links while preserving shared href, label, and note copy.
- Unit tests must verify shared operator projection links and rich projection objects expose only public render fields so extra runtime properties on supplied inventories cannot leak into rendered local navigation.
- Unit tests must verify the shared operator surface summary exposes only public aggregate fields so extra supplied inventory group or link properties cannot leak into local operation counts or route lists.
- Unit tests must verify the shared operator surface summary returns a fresh frozen routes array per call so caller-side route array mutation cannot contaminate later local operation counts or route lists.
- Unit tests must verify that supplied shared operator inventories with duplicate route entries fail before summaries or projections are derived, preventing silent route shadowing in local navigation helpers.
- Unit tests must verify that supplied shared operator inventories with duplicate group names, link labels, or link notes fail before summaries or projections are derived, preventing ambiguous local navigation copy from rendered operator helpers.
- Unit tests must verify that supplied shared operator inventories that are not arrays fail before summaries or projections are derived, preventing malformed runtime inventory values from surfacing generic projection errors.
- Unit tests must verify that supplied shared operator inventory arrays are plain arrays with no extra string or symbol fields, preventing decorated/custom array records from being accepted as local navigation inventories.
- Unit tests must verify that supplied shared operator inventory array indexes and supplied group link array indexes are complete enumerable data slots, preventing sparse, accessor-backed, or hidden array entries from being read during local navigation projection.
- Unit tests must verify that empty supplied shared operator inventories fail before summaries or projections are derived, preventing blank local navigation surfaces from being treated as valid.
- Unit tests must verify that supplied shared operator inventories with blank group names, routes, labels, or notes fail before summaries or projections are derived, preventing whitespace-only local navigation fields from being treated as valid.
- Unit tests must verify that supplied shared operator inventory groups with invalid link arrays fail before summaries or projections are derived, preventing malformed runtime inventory objects from surfacing generic projection errors.
- Unit tests must verify that supplied shared operator inventory arrays with sparse/missing group entries fail as missing index descriptors before summaries or projections are derived, preventing malformed runtime group slots from being silently skipped or read.
- Unit tests must verify that supplied shared operator inventory links with invalid link objects fail before summaries or projections are derived, preventing malformed runtime link entries from surfacing generic projection errors.
- Unit tests must verify that supplied shared operator inventory link arrays with sparse/missing entries fail as missing index descriptors before summaries or projections are derived, preventing malformed runtime link slots from being silently dropped or read.
- Unit tests must verify that supplied shared operator inventory group names, routes, labels, and notes with non-string values fail before summaries or projections are derived, preventing malformed runtime field values from surfacing generic string-operation errors.
- Unit tests must verify that supplied shared operator inventory routes with non-local, uppercase, query, hash, trailing-slash, double-slash, or dynamic-segment shapes fail before summaries or projections are derived, preventing malformed runtime routes from entering local navigation helpers.
- Unit tests must verify that every shared operator surface route is reachable from at least one focused page-specific or rich operator projection, outside the broad launch/settings/runbook inventory projections.
- Unit tests must verify that supplied shared operator inventory groups and links must carry required fields as own properties, preventing prototype-backed runtime records from being rendered as local navigation.
- Unit tests must verify that supplied shared operator inventory groups and links must carry required fields as plain data properties, preventing accessor-backed runtime records from being read during local navigation projection.
- Unit tests must verify that supplied shared operator inventory groups and links must carry required fields as enumerable data properties, preventing hidden runtime fields from being accepted as local navigation.
- Unit tests must verify that supplied shared operator inventory groups and links must be ordinary object records, preventing class/custom-prototype runtime records from being accepted as local navigation.
- Unit tests must verify that supplied shared operator inventory groups and links expose only their exact public fields, preventing extra string or symbol fields from being accepted as local navigation records.
- Unit tests must verify that supplied shared operator inventory link arrays are plain arrays with no extra string or symbol fields, preventing decorated/custom array records from being accepted as local navigation.
- The Playwright smoke test must verify the root launch dashboard's visible links from the same shared operations inventory instead of a duplicated hard-coded browser list.
- The seeded investor demo path must verify that `/demo` renders visible console navigation from the same shared operations inventory instead of a duplicated hard-coded browser list.
- The seeded investor demo path must verify that `/settings/operations` renders grouped local operator surfaces, visible links/routes from the shared operations inventory, and safety-boundary text without command execution, file inspection, API probes, mutations, exports, provider calls, billing records, notifications, live AI, SMS, email, secret exposure, or live feature enablement.
- The seeded investor demo path must verify that `/settings/demo` renders seeded demo readiness, runtime gates, local seed/scenario signals, and safety-boundary text without imports, campaign scheduling, worker execution, inbox replies, report execution, exports, mutations, provider calls, billing records, notifications, live feature enablement, or secrets.
- The seeded investor demo path must verify that `/settings/demo` visible checkpoint names, shared signal labels, boundaries, operational link labels, and link targets are projected from the shared local operator surface inventory.
- The seeded investor demo path must verify that `/settings/reports`, `/settings/workflows`, and `/settings/releases` visible links, route targets, labels, notes, and workflow boundaries are projected from the shared local operator surface inventory.
- The seeded investor demo path must verify that `/settings/integrations` visible integration links and `/settings/security` visible navigation links are projected from the shared local operator surface inventory.
- The seeded investor demo path must verify that `/settings/system` renders read-only safety, runtime, queue, and API protection metadata.
- The seeded investor demo path must verify that `/settings/health` renders read-only health endpoint contract, demo-safe defaults, runtime boundary, operational links, and safety-boundary text without health probes, API calls, commands, mutations, provider calls, billing, notifications, secrets, or live feature enablement.
- The seeded investor demo path must verify that `/settings/runbook` keeps current local admin surface links visible, including queue operations, delivery operations, readiness audit, and provider numbers, without executing commands or creating external-impact side effects.

Post-MVP deployment platform notes:

- `npm run platform:check` must verify that `docs/DEPLOYMENT_PLATFORM_NOTES.md` documents demo-safe hosting defaults, production gate usage, smoke routes, worker boundaries, and no-external-impact platform constraints.
- `npm run validate` must include `npm run platform:check`.
- `docs/PRODUCTION_WORKER_POLICY.md` must remain planning-only until future executable worker gates are added; current validation must continue to prove production-like worker execution and non-`local-demo` worker deployment classes are blocked, including the reserved `production-live-campaign` planning label. Live-worker control tests must reject malformed, non-array, sparse, decorated-array, array-subclass, mutable, non-frozen-descriptor, missing, reordered, renamed, requirement-replaced, unsupported-status, extra-field, accessor-backed, prototype-backed, null-prototype, class-instance, and partial custom control arrays before any future authorization can pass.

Post-MVP local usage view:

- The seeded investor demo path must verify that `/settings/usage` renders local usage totals, billing boundary status, and recent usage events without requiring live billing or provider configuration.

Post-MVP provider numbers view:

- The seeded investor demo path must verify that `/settings/numbers` renders read-only local number metadata and its safety boundary without provisioning numbers, calling providers, or enabling live messaging.

Post-MVP campaign operations view:

- The seeded investor demo path must verify that `/settings/campaigns` renders read-only campaign status, queue status, and safety-boundary metadata without scheduling campaigns, running workers, calling providers, billing, sending notifications, mutating queue rows, or enabling live messaging.

Post-MVP queue operations view:

- The seeded investor demo path must verify that `/settings/queue` renders read-only scheduled job timing, queue status, worker boundary, payload validity, and safety-boundary metadata without enqueueing jobs, running workers, calling Redis, calling providers, billing, sending notifications, mutating queue rows, updating campaigns, or enabling live messaging.
- Unit tests must verify that `/settings/queue` uses static validated metadata for supported local worker command references, runtime-frozen worker command and worker mode vocabularies with caller-mutation rejection, safety-boundary copy, public fields, frozen snapshots, stable order, unique identifiers, package-script references, secret-like literal rejection, command-like literal rejection outside the allowlisted command reference field, no command execution, no external impact, no mutation, and no secret display before local queue metadata renders.
- Unit tests must verify that `/settings/queue` returned worker-command and safety-boundary arrays are detached from exported metadata while rendered counts stay aligned before local queue metadata renders.
- The seeded investor demo path must verify that `/settings/queue` renders the validated command-execution, external-impact, mutation, and secrets-displayed no-impact summary states without executing workers, enqueueing jobs, calling Redis, calling providers, billing, notifications, SMS, mutations, campaign updates, or live messaging enablement.

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
- The seeded investor demo path must verify that `/settings/billing` and `/settings/ai` header navigation labels and link targets are projected from the shared local operator surface inventory.
- The seeded investor demo path must verify that `/settings/contacts`, `/settings/campaigns`, `/settings/audience`, `/settings/templates`, `/settings/inbox`, and `/settings/data` header navigation labels and link targets are projected from the shared local operator surface inventory.
- The seeded investor demo path must verify that `/settings/provider`, `/settings/numbers`, `/settings/compliance`, `/settings/system`, `/settings/usage`, and `/settings/readiness-audit` header navigation labels and link targets are projected from the shared local operator surface inventory.
- The seeded product demo path must verify `/dashboard/inbox` renders the owner-facing inbox list/thread workflow and exercises local inbound reply, note, resolve, and reopen actions without SMS, provider calls, billing, live AI, secrets, or live feature enablement.
- The seeded product demo path must verify `/dashboard/templates` renders the owner-facing template list/create workflow and creates local reusable copy, and `/dashboard/templates/:templateId` edits local reusable copy without rendering live outbound messages, scheduling campaigns, provider calls, SMS, billing, live AI, secrets, hard deletion, or live feature enablement.
- The seeded product demo path must verify `/dashboard/contacts/:contactId` renders the owner-facing contact detail/edit workflow and updates local profile, consent, notes, tags, list metadata, soft archive, restore state, and local duplicate merge without SMS, provider calls, billing, live AI, secrets, hard deletion, consent/preflight bypasses, or live feature enablement.
- The seeded product demo path must verify `/dashboard/campaigns/:campaignId` renders the owner-facing campaign detail workflow and exercises local draft edit plus queued campaign cancellation without SMS, provider calls, worker execution, billing, live AI, notifications, secrets, hard deletion, preflight bypasses, or live feature enablement.
- The seeded product demo path must verify `/dashboard/analytics` renders the owner-facing analytics detail workflow with tenant-scoped contact, campaign, inbox, and local usage totals from existing analytics APIs without report execution, exports, mutations, provider calls, Stripe calls, billing artifacts, live AI, SMS, secrets, or live feature enablement.

Post-MVP reporting index view:

- The seeded investor demo path must verify that `/settings/reports` renders a read-only local reporting index with report links, operational metrics, readiness signals, and safety-boundary text without executing reports, creating exports, mutating records, provider calls, billing, live AI, SMS, email, notifications, secret exposure, or live feature enablement.

Post-MVP integration operations view:

- The seeded investor demo path must verify that `/settings/integrations` renders read-only provider, AI, billing, webhook, and notification integration boundaries without provider calls, prompt submission, billing artifacts, notifications, mutations, secret exposure, enqueueing, exports, or live feature enablement.

Post-MVP workflow operations view:

- The seeded investor demo path must verify that `/settings/workflows` renders read-only workflow checkpoints, runtime boundaries, operational signals, and safety-boundary text without imports, campaign scheduling, worker execution, inbox replies, delivery retries, prompt submission, report execution, exports, mutations, provider calls, billing, notifications, or live feature enablement.

Post-MVP release operations view:

- The seeded investor demo path must verify that `/settings/releases` renders read-only release checklist, runtime boundary, release surface links, and safety-boundary text without command execution, migrations, tests, browser launches, git operations, deploys, mutations, provider calls, billing, notifications, secrets, or live feature enablement.

Post-MVP notification operations view:

- The seeded investor demo path must verify that `/settings/notifications` renders read-only notification channel boundaries, no-send controls, runtime gates, no-impact summary states, and safety-boundary text without creating recipients, subscriptions, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, SMS, email, mutations, or notification delivery.

Post-MVP readiness audit operations view:

- The seeded investor demo path must verify that `/settings/readiness-audit` renders tenant-scoped local readiness audit events, action/subject filters, a bounded CSV export link, and safety-boundary text without mutating audit events, exposing secrets, calling providers, billing, live AI, SMS, email, notifications, or enabling live features.
- The seeded investor demo path must verify that `/settings/readiness-audit` renders command-execution, external-impact, mutation, and secrets-displayed no-impact summary states without mutating audit events, exposing secrets, calling providers, billing, live AI, SMS, email, notifications, or enabling live features.

Post-MVP contract operations view:

- The seeded investor demo path must verify that `/settings/contracts` renders read-only contract inventory, validation commands, drift controls, and safety-boundary text without reading contract file contents, executing checks, scanning files, mutating records, provider calls, billing records, live AI calls, SMS, email, notifications, secret exposure, or live feature enablement.
- Unit tests must verify that the static contract operations inventory keeps required contract paths, runtime-frozen supported file-path, validation-command, and no-impact vocabularies, validation command references backed by `package.json` scripts, drift controls, public fields, frozen snapshots, detached returned arrays with aligned counts, stable order, unique identifiers, whitespace-clean copy, secret-like literal rejection, command-like literal rejection outside the allowlisted validation-command field, visible no-mutation summary rendering, and read-only counts stable before `/settings/contracts` renders them.

Post-MVP validation operations view:

- The seeded investor demo path must verify that `/settings/validation` renders read-only local validation gate inventory, repair signals, and safety-boundary text without executing commands, inspecting logs, scanning files, mutating records, provider calls, billing records, live AI calls, SMS, email, notifications, secret exposure, or live feature enablement.
- Unit tests must verify that the static validation operations inventory keeps gate command references backed by `package.json` scripts, runtime-frozen supported gate-command and local-only area vocabularies, repair signals, public fields, frozen snapshots, detached returned arrays with aligned counts, stable order, unique identifiers, required boundary terms, whitespace-clean copy, secret-like literal rejection, command-like literal rejection outside the allowlisted gate-command field, no command execution, no external impact, no mutation, and no secret display stable before `/settings/validation` renders them.
- Unit tests must verify that validation operations export runtime-frozen supported command-execution, external-impact, mutation, and secrets-displayed vocabularies before `/settings/validation` renders no-impact metadata.
- Unit tests must verify that validation operations keep gate command references inside the runtime-frozen supported command allowlist before `/settings/validation` renders local gate metadata.
- Unit tests must verify that validation operations keep gate area labels inside the runtime-frozen supported local-only area vocabulary before `/settings/validation` renders local gate metadata.

Post-MVP security operations view:

- Unit tests must verify that the static security operations inventory keeps security controls, validation command references, safety boundaries, public fields, frozen snapshots, stable order, unique identifiers, no command execution, no external impact, and no secret display stable before `/settings/security` renders them.
- Unit tests must verify that the static security operations inventory keeps control status values inside the documented local-only vocabulary and safety boundaries explicitly name blocked secrets, provider calls, SMS, email, notifications, and mutations before `/settings/security` renders them.
- Unit tests must verify that the static security operations inventory exports runtime-frozen supported control-status, command-execution, external-impact, mutation, and secrets-displayed vocabularies before `/settings/security` renders metadata.
- Unit tests must verify that the static security operations exported vocabularies reject caller mutation before `/settings/security` renders metadata.
- Unit tests must verify that the static security operations inventory keeps validation command references inside the runtime-frozen supported command allowlist and backed by `package.json` scripts before `/settings/security` renders them.
- Unit tests must verify that `/settings/security` returned control, validation-reference, and safety-boundary arrays are detached from exported metadata while read-only counts stay aligned before local security metadata renders.
- Unit tests must verify that the static security operations inventory keeps controls, validation references, and safety boundaries whitespace-clean before `/settings/security` renders metadata.
- Unit tests must verify that the static security operations inventory rejects secret-like literals before `/settings/security` renders metadata.
- Unit tests must verify that the static security operations inventory rejects command-like literals outside the allowlisted validation-command field before `/settings/security` renders metadata.
- The seeded investor demo path must verify that `/settings/security` renders command-execution, external-impact, mutation, and secrets-displayed no-impact labels without scanning files, exposing raw env values, mutating records, provider calls, billing records, live AI, SMS, email, notifications, or live feature enablement.

Post-MVP notification operations view:

- Unit tests must verify that the static notification operations inventory exports runtime-frozen supported vocabularies with caller-mutation rejection, keeps returned status arrays detached from exported metadata while counts stay aligned, keeps channel names, channel status values, and no-impact summary states for command execution, external impact, mutation, and secret display inside the supported local notification vocabulary, channel-specific boundary terms, channel boundaries, no-send controls, safety-boundary copy, public fields, frozen snapshots, stable order, unique identifiers, no command execution, no external impact, no mutation, no secret display, required no-send control terms, whitespace-clean copy, command-like literal rejection, and secret-like literal rejection stable before `/settings/notifications` renders them.

Post-MVP readiness audit operations view:

- Unit tests must verify that the static readiness audit operations inventory exports runtime-frozen supported action, subject-type, bounded positive default-limit, bounded positive CSV export-limit, and no-impact vocabularies, rejects caller mutation of those exported vocabularies, keeps returned status arrays detached from exported vocabularies, keeps rendered counts aligned to returned arrays, keeps JSON/CSV readiness-audit query filters constrained to those supported vocabularies, derives the default query limit and maximum query limit ceiling from the bounded limit vocabularies, keeps centralized CSV export-link construction tied to the bounded export-limit and supported filters, rejects unsupported export-link limits, keeps no-impact summary states inside the supported local vocabulary, pins bounded CSV export limits, safety-boundary copy, public fields, frozen snapshots, stable order, unique identifiers, whitespace-clean copy, command-like literal rejection, and secret-like literal rejection stable before `/settings/readiness-audit` renders filters or CSV links.

Post-MVP API operations inventory:

- Unit tests must keep the static `/settings/api` route inventory aligned with implemented local API methods, including soft archive, draft update, inbox read endpoints, and billing usage reads.
- Unit tests must fail when a listed API route path has no backing `app/**/route.ts` file or when route-method rows are duplicated.
- Unit tests must fail when an implemented local API route method under `app/api/**/route.ts` is missing from the static `/settings/api` inventory.
- The inventory must report the live test SMS endpoint as the only external-impact route while all other routes remain no-external-impact until future live SMS, billing, notification, provider, or AI gates are designed and tested.
- Unit tests must verify that live test SMS stays blocked by default and enables only with explicit Twilio environment credentials, live messaging, the live-test flag, allowlisted recipients, and the exact confirmation phrase.
- Unit tests must verify that the exported API operations inventory and per-call status, rate-limit, and route snapshots are frozen, and that status calls return fresh rate-limit objects and route arrays so caller mutation cannot leak into later local API inventory renders.
- Unit tests must verify that exported API route entries, returned status snapshots, rate-limit snapshots, and per-call route snapshots expose only their public documented fields.
- Unit tests must verify that exported API route entries keep supported methods, canonical local `/api/` path shape, boolean mutation/external-impact flags, nonblank area/safety copy, and unique method/path rows before local API operations renders.
- Unit tests must verify that returned API operation route arrays are detached from exported metadata while route, mutating-route, and external-impact counts stay aligned before local API operations renders.
- Unit tests must verify that returned API operation rate-limit metadata stays clamped to local policy boundaries while route counts remain aligned before local API operations renders.
- Unit tests must verify that the exported API operations inventory keeps stable route-method order so local `/settings/api` review pages do not churn without an intentional inventory update.
- Unit tests must verify that static API operations path, area, and safety metadata remain whitespace-clean and free of command-like or secret-like literals before local `/settings/api` renders them.
- Unit tests must verify that API operations export a runtime-frozen supported method vocabulary and that the static route inventory remains aligned to it before local `/settings/api` renders.
- Unit tests must verify that implemented-route reverse coverage derives its method scan from the exported API method vocabulary instead of a duplicated local method list.
- Unit tests must verify that API operations export a runtime-frozen supported area vocabulary and that the static route inventory remains aligned to it before local `/settings/api` renders.
- Unit tests must verify that API operations export runtime-frozen command-execution, external-impact, mutation, and secrets-displayed no-impact vocabularies before local `/settings/api` renders.

Post-MVP webhook operations view:

- The seeded investor demo path must verify that `/settings/webhooks` renders read-only Twilio route coverage, event-type summaries, recent local webhook metadata, and safety-boundary text without webhook replay, provider calls, outbound replies, message/contact mutation, notifications, billing records, SMS, or live messaging enablement.

Post-MVP delivery operations view:

- The seeded investor demo path must verify that `/settings/delivery` renders read-only message direction counts, delivery status metadata, provider status labels, recent message metadata, and safety-boundary text without sends, retries, webhook replays, provider calls, message mutation, notifications, billing records, SMS, or live messaging enablement.
