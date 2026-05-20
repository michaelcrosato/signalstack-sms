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
- The seeded investor demo path verifies `/settings/compliance` as a read-only compliance detail surface without live provider verification or messaging enablement.
- The seeded investor demo path verifies `/settings/usage` as a read-only local usage and analytics surface without live billing or provider configuration.
- The seeded investor demo path verifies `/settings/numbers` as a read-only local provider-number metadata surface without provisioning, provider calls, or messaging enablement.
- The seeded investor demo path verifies `/settings/campaigns` as a read-only campaign and queue operations surface without scheduling campaigns, running workers, provider calls, billing, notifications, queue mutation, or messaging enablement.
- The seeded investor demo path verifies `/settings/contacts` as a read-only contact operations surface without importing contacts, mutating consent, changing labels, provider calls, billing, notifications, or messaging enablement.
- The seeded investor demo path verifies `/settings/templates` as a read-only template operations surface without creating templates, editing copy, rendering live outbound messages, scheduling campaigns, provider calls, billing, notifications, or messaging enablement.
- The seeded investor demo path verifies `/settings/inbox` as a read-only shared inbox operations surface without message creation, assignment, resolution, provider calls, billing, notifications, contact mutation, or messaging enablement.
- The Playwright smoke test verifies the root local launch dashboard links to existing local-only operational views while still rendering demo-safe defaults.
- The seeded investor demo path verifies `/settings/runbook` as a read-only local operator checklist without command execution or external-impact side effects.
