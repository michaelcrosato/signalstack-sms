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
