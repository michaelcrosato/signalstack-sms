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
- **M4 credential envelopes**: AES-256-GCM round trips only under the exact tenant/provider/account/external-
  ID/credential-secret-version binding. Ciphertext, IV, tag, fingerprint, key/envelope version, master key, and AAD
  tampering fail generically; secret-output scans cover responses, HTML, logs, audit, CSV, fixtures, and
  errors.
- **M4 provider control plane**: ADMIN/same-origin denial precedes body/secret reads; verification,
  rotation, revocation, health, discovery, and import use bounded injected transports and safe DTOs. Twilio
  fixtures cover exact AC/MG/E.164/capability parsing, malformed/provider/timeout paths, and no partial writes.
- **M4 provider factory**: dummy implements the complete interface deterministically and performs no
  environment read/network effect. Twilio verification/discovery/health/create/fetch/normalization/retry/
  signature surfaces are fixture-tested, but no M4 route/worker invokes message creation or provider resource
  mutation.
- **M4 ownership and routing**: mandatory PostgreSQL tests install the migration under least privilege,
  exercise forced RLS/same-tenant/global account-number-service uniqueness and concurrent import/rotation/
  revoke races, and leave no Prisma diff. Two organizations with separate accounts/numbers/services prove
  correct signed inbound/status routing; wrong credential, crossed/unknown destination, injected ambiguity,
  disabled/revoked state, and generation races share generic denial with zero event/domain/audit persistence.
- **M4 exit proof** uses non-owner web/worker roles plus deterministic HTTP/provider fixtures. It must pass
  without a real credential, carrier message, provider purchase/release/port/configuration, paid lookup, or
  external network call.
- **Demo path**: `npm run test:e2e:demo` (investor) and `npm run test:e2e:product-demo` (product) run against a
  seeded database, separate from the default gate.

## Fixtures & Playwright

- Webhook, provider-control, and CSV fixtures live in `tests/fixtures/`. Provider fixtures contain only
  impossible test identifiers/tokens and deterministic responses; secret scanning rejects production-shaped
  credential material.
- Playwright serves a local-only server on `127.0.0.1`, default test port separate from `npm run dev`.
  `PLAYWRIGHT_PORT` overrides the port; existing-server reuse is explicit via `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`.

## Coverage style

Prefer table-driven, representative coverage of real invariants over exhaustive syntactic permutations. The
former permutation catalogues for auth aliases and live-worker proxy/reflection cases were collapsed to
representative suites (see `git log`); do not reintroduce permutation churn.
