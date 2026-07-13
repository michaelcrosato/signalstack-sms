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
- **M5 acceptance/idempotency**: public direct, public conversation, and browser inbox routes atomically
  reserve one `Message`, attempt one, immutable keyed payload binding, conversation projection, and
  `message.accepted` event before returning. Exact concurrent/replayed bindings return one resource; changed
  route/direction/contact/conversation/destination/body/media/transport conflicts. Public replay remains
  credential scoped, browser UUID replay remains conversation scoped, and no acceptance route invokes a
  provider.
- **M5 state separation**: table-driven DTO/database tests cover every frozen application and attempt state,
  compatibility provider projections, explicit transport/mode, and first-class ambiguity. Aggregate,
  inbox, status, and ADMIN projections never count ambiguity as pending or infer claimability from raw
  provider text.
- **M5 tenant/database boundary**: fresh least-privilege install/no-diff proof adds `MessageAttempt` to the
  protected manifest, forced RLS/fingerprint/grant/static-inventory/relation matrix. Two tenants cannot read,
  mutate, link, claim, callback-bind, reconcile, attest, or retry each other's messages, attempts, provider
  accounts, credentials, senders, or correlation identifiers. The bounded direct dispatch function has a
  fixed search path, database clock, worker-only execute ACL, and no ordinary table privilege.
- **M5 claim/frontier races**: two workers cannot own one attempt. Expired pre-frontier work is reclaimable;
  injected crashes after acceptance, before the frontier, after frontier commit, after fixture provider
  impact, and before result persistence prove at most one automatic adapter create per attempt. Frontier or
  possible-impact expiry becomes durable ambiguity and never auto-requeues. Cancellation/provider-call,
  lease/finish, and retry-successor races have one database winner.
- **M5 final gate**: fixture workers recheck live flag, non-demo runtime, exact direct-worker class, Twilio
  selection, profile/A2P, contact archive/consent/opt-out/evidence/quiet hours, and exact M4 account,
  credential generation, sender ownership/capability immediately before create. Opt-out/archive/quiet-hour/
  disable/revoke/rotation races prove a single winner and zero provider calls when the gate loses.
- **M5 provider policy**: deterministic transports prove exact SMS/MMS create fields, HTTPS callback
  correlation, bounded timeout, redacted errors, normalized results, three-attempt maximum with 5-second/
  30-second no-impact backoff, terminal no-retry, and no successor for network/timeout/5xx/malformed/SID-
  bearing/persistence-uncertain outcomes. No test assumes provider create idempotency.
- **M5 callbacks/reconciliation**: signed two-tenant fixtures attach a lost SID through valid attempt
  correlation, reject crossed account/sender/destination/SID/HMAC evidence, and remain idempotent/monotonic
  under duplicate, out-of-order, callback/create/fetch races. Attempt, message, and deduplicated customer
  events commit together. Fetch can converge known-SID ambiguity but never creates or clears ambiguity on
  failure.
- **M5 ADMIN review**: cookie auth, ADMIN role, exact same origin, no-store, redacted DTOs, explicit
  `ATTEST NOT SENT` plus bounded reason, and separate `RETRY MESSAGE` confirmation are covered before body or
  provider work. Stale/non-ambiguous/SID-bearing/concurrent/already-retried actions conflict; one attested
  attempt creates at most one successor, and that successor still passes the worker gate.
- **M5 no-carrier gate**: unit, PostgreSQL, HTTP, browser, build, seed, OpenAPI/example, validation, and
  default worker runs use dummy/injected transports with real live flags and carrier credentials absent.
  Any unexpected Twilio network attempt fails the suite.
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
