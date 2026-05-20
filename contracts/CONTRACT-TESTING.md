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
- The seeded investor demo path must verify that `/settings/system` renders read-only safety, runtime, queue, and API protection metadata.

Post-MVP deployment platform notes:

- `npm run platform:check` must verify that `docs/DEPLOYMENT_PLATFORM_NOTES.md` documents demo-safe hosting defaults, production gate usage, smoke routes, worker boundaries, and no-external-impact platform constraints.
- `npm run validate` must include `npm run platform:check`.

Post-MVP local usage view:

- The seeded investor demo path must verify that `/settings/usage` renders local usage totals, billing boundary status, and recent usage events without requiring live billing or provider configuration.

Post-MVP provider numbers view:

- The seeded investor demo path must verify that `/settings/numbers` renders read-only local number metadata and its safety boundary without provisioning numbers, calling providers, or enabling live messaging.
