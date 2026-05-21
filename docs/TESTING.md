# Testing

Milestone 0 validation runs:

- Contract presence, API documentation drift, and tenant `orgId` invariant checks
- Secret/default safety check
- ESLint
- TypeScript
- Prisma validation and client generation
- Vitest smoke
- Playwright smoke
- Next build

Additional deterministic checks:

- `npm run test:e2e:demo` runs the investor demo path after the local database has been migrated and seeded.
- `npm run worker` processes local due scheduled campaign jobs through the dummy provider only.
- `npm run worker:watch` runs the same worker in continuous polling mode for local demos. It is still blocked unless `MESSAGING_PROVIDER=dummy` and live messaging is disabled.
- `WORKER_MAX_JOBS_PER_POLL` caps local worker throughput per poll and is clamped to a bounded range for demos/tests.
- BullMQ enqueue and worker helpers are unit-tested without requiring Redis. Local validation must remain green with `QUEUE_BACKEND` unset or set to `database`.
- Production deployment gate tests verify that production-like environments cannot enable external-impact settings without an explicit future override.
- API rate limiting helpers are unit-tested with deterministic clocks and isolated stores. Local validation keeps the middleware defaults generous enough for smoke and demo paths.
- API operations inventory tests verify that the read-only `/settings/api` route list includes implemented local methods such as contact soft archive, campaign draft update, inbox message/note reads, and billing usage reads while keeping external-impact routes at zero.
- The seeded investor demo path verifies `/settings/compliance` as a read-only compliance detail surface without live provider verification or messaging enablement.
- The seeded investor demo path verifies `/settings/usage` as a read-only local usage and analytics surface without live billing or provider configuration.
- The seeded investor demo path verifies `/settings/numbers` as a read-only local provider-number metadata surface without provisioning, provider calls, or messaging enablement.
- The seeded investor demo path verifies `/settings/campaigns` as a read-only campaign and queue operations surface without scheduling campaigns, running workers, provider calls, billing, notifications, queue mutation, or messaging enablement.
- The seeded investor demo path verifies `/settings/queue` as a read-only scheduled queue operations surface without enqueueing jobs, running workers, Redis calls, provider calls, billing, notifications, queue mutation, campaign updates, or messaging enablement.
- The seeded investor demo path verifies `/settings/contacts` as a read-only contact operations surface without importing contacts, mutating consent, changing labels, provider calls, billing, notifications, or messaging enablement.
- The seeded investor demo path verifies `/settings/data` as a read-only data operations surface without hard deletion, record mutation, provider calls, billing, notifications, live AI, SMS, or live feature enablement.
- The seeded investor demo path verifies `/settings/audience` as a read-only audience operations surface without changing memberships, evaluating segments for sends, provider calls, billing, notifications, label mutation, or messaging enablement.
- The seeded investor demo path verifies `/settings/templates` as a read-only template operations surface without creating templates, editing copy, rendering live outbound messages, scheduling campaigns, provider calls, billing, notifications, or messaging enablement.
- The seeded investor demo path verifies `/settings/inbox` as a read-only shared inbox operations surface without message creation, assignment, resolution, provider calls, billing, notifications, contact mutation, or messaging enablement.
- The seeded investor demo path verifies `/settings/delivery` as a read-only delivery operations surface without sends, retries, webhook replays, message mutation, provider calls, billing, notifications, SMS, or messaging enablement.
- The seeded investor demo path verifies `/settings/team` as a read-only team operations surface without invites, role changes, suspensions, membership deletion, Clerk calls, email, notifications, provider calls, billing, SMS, or messaging enablement.
- The seeded investor demo path verifies `/settings/billing` as a read-only local billing operations surface without Stripe calls, subscriptions, invoices, payment collection, card charges, email, notifications, provider calls, SMS, or live billing enablement.
- The seeded investor demo path verifies `/settings/notifications` as a read-only notification no-send boundary without recipients, templates, jobs, sends, alerts, webhooks, provider calls, billing records, live AI calls, SMS, email, mutations, or notification delivery.
- The seeded investor demo path verifies `/settings/readiness-audit` as a read-only local readiness audit surface with filters and bounded CSV export links without mutating audit events, exposing secrets, calling providers, billing, live AI, SMS, email, notifications, or enabling live features.
- The Playwright smoke test verifies the root local launch dashboard links to existing local-only operational views while still rendering demo-safe defaults.
- The seeded investor demo path verifies `/settings/runbook` as a read-only local operator checklist with links to current local admin surfaces, including queue, delivery, readiness audit, and provider numbers, without command execution or external-impact side effects.
