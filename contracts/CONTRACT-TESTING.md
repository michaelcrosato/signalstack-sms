# Testing Contract

Owner: tests-quality.

## Required gate

`npm run validate` runs, in order: contracts, secrets, compliance, production gates (gate/auth/worker),
observability, operator, platform, context-budget, lint, typecheck, Prisma validate/generate, Vitest,
Playwright smoke, and Next build. GitHub `ci` and `premerge` run the protected `scripts/local-gate.ps1`
with demo-safe defaults rather than treating direct validation calls as green.

## Contract checks (`npm run contracts:check`)

- Fails when an implemented `app/api/**/route.ts` method (`GET/POST/PATCH/PUT/DELETE/HEAD/OPTIONS`, including
  function, const, typed-const, and named-export handlers) is missing from `contracts/CONTRACT-API.md` or `docs/API_MAP.md`.
- Route-method extraction ignores mentions inside comments, strings, template literals, and regex literals.
- Fails when a tenant-scoped Prisma model loses its `orgId` field.

## Required test coverage (real invariants)

- **Demo-safe defaults** are runtime-frozen so callers cannot mutate `DEMO_MODE`, `LIVE_MESSAGING_ENABLED`,
  `LIVE_BILLING_ENABLED`, `MESSAGING_PROVIDER`, or `AI_PROVIDER` before UI/health/compliance render them.
- **Mutating API authorization**: every mutating route handler calls `requireApiRole` before reading the
  request body, except the signed Twilio inbound/status webhooks. The real guarantee is a filesystem scan of
  all `app/api/**/route.ts`; representative alias/body-reader forms cover the analyzer. See
  `tests/unit/auth/api-route-authorization.test.ts`.
- **Worker safety**: worker readiness accepts only unset/empty/`local-demo` `WORKER_DEPLOYMENT_CLASS`;
  production-like runtimes and the reserved, unimplemented `production-live-campaign` class are blocked. See
  `tests/unit/queue/live-worker-controls.test.ts` and `tests/unit/queue/worker.test.ts`.
- **Operations inventory** is a bijection with implemented pages (every listed route has a `page.tsx`; every
  local operator page is listed) and is frozen against caller mutation. See
  `tests/unit/operations/operator-surfaces.test.ts`.
- **Webhooks** fail closed on malformed/unsigned payloads before tenant lookup or local mutations; duplicate
  events are idempotent.
- **Demo path**: `npm run test:e2e:demo` (investor) and `npm run test:e2e:product-demo` (product) run against a
  seeded database, separate from the default gate.

## Fixtures & Playwright

- Webhook + CSV fixtures live in `tests/fixtures/`.
- Playwright serves a local-only server on `127.0.0.1`, default test port separate from `npm run dev`.
  `PLAYWRIGHT_PORT` overrides the port; existing-server reuse is explicit via `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`.

## Coverage style

Prefer table-driven, representative coverage of real invariants over exhaustive syntactic permutations. The
former permutation catalogues for auth aliases and live-worker proxy/reflection cases were collapsed to
representative suites (see `git log`); do not reintroduce permutation churn.
