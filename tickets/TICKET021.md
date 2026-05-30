# TICKET021 — Controlled Clerk authentication enablement and RBAC enforcement

- **Status:** Todo
- **Priority:** P1

## Goal
Implement route-level and API-level RBAC enforcement utilizing Clerk auth in production-like environments, while preserving the deterministic local demo session defaults by default.

## Context
Production auth/RBAC is currently a mockable boundary (`lib/auth/session.ts` and `resolveProductionCurrentOrg`). In Phase 2, we need to wire Clerk auth integration safely, ensuring that when `PRODUCTION_AUTH_ENABLED=true`, Clerk JWT tokens are validated, matching the verified subject to a tenant `Membership` record with correct `Role` mapping.

## Scope
- **In:** Clerk webhook ingestion, session validation middleware, RBAC checks on API routers, unit tests.
- **Out:** Replacing demo-safe defaults unconditionally; live external deployments.

## Likely files
`lib/auth/session.ts`, `middleware.ts`, `app/api/orgs/current/route.ts`, `tests/unit/auth/session.test.ts`.

## Steps
1. Review `lib/auth/session.ts` which has a seam (`resolveProductionCurrentOrg`) but is currently flag-gated.
2. Implement robust Clerk token verification using the `@clerk/nextjs` or lightweight fetch-based JWKS key verification to stay lightweight and secure.
3. Map verified Clerk subjects (`sub`) to a specific `Membership` and `Org` in the database.
4. Integrate session checks into `middleware.ts` to block unauthorized routes when `PRODUCTION_AUTH_ENABLED=true`.
5. Write unit tests mocking Clerk token states (valid, expired, wrong tenant, missing role).
6. Verify compliance with `npm run production-auth:check` and `npm run validate`.

## Acceptance criteria
- [ ] Session resolver returns correct Tenant and Role structures when valid Clerk tokens are supplied.
- [ ] Request middleware blocks unauthorized routing under `PRODUCTION_AUTH_ENABLED=true`.
- [ ] Demo session behavior is unaffected when `PRODUCTION_AUTH_ENABLED` is false.
- [ ] Unit tests for Clerk authentication resolver are completely passing.
- [ ] `npm run validate` runs and exits 0.

## Commands
`npm test -- auth/session`, `npm run validate`

## Risks
Auth bypass or lockouts. Mitigated by keeping `PRODUCTION_AUTH_ENABLED` defaulted to `false` and utilizing strict unit tests for validation paths.

## Notes
Never commit real Clerk API keys or secrets. Use `.env.example` placeholders.
