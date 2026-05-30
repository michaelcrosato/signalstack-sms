# SPEC-020 — PostgreSQL RLS Production Enablement

- **Status:** Todo · **Priority:** P2 · **Pillar:** Future-proofing · **Effort:** L

## Description
Adjust the application's runtime DB connection context to execute queries as a non-superuser database role (`app_rls`) using transaction-scoped RLS guards (`withTenantRls`) on critical multi-tenant request paths. This ensures that the RLS policies successfully applied as an opt-in backstop in SPEC-010 are actively enforced for live user requests in production.

## Prereqs / deps
Depends on SPEC-010 (PostgreSQL RLS opt-in backstop) and TICKET009 (Clerk auth organization context).

## Implementation approach
1. Define a global or middleware wrapper/interceptor that automatically resolves the request's tenant org ID (e.g. from the session or JWT context).
2. Wire critical multi-tenant API endpoints (e.g., contacts, campaigns, inbox) to run their Prisma queries wrapped in `withTenantRls(orgId, ...)` to enforce database RLS during execution.
3. Configure the database client instance to use the non-superuser database user (`app_rls`) if production RLS enforcement is enabled via the environment flag `DATABASE_RLS_ENFORCED=true`.
4. Ensure full fallback compatibility: if `DATABASE_RLS_ENFORCED` is unset or false, connection strings connect as the standard owner/superuser role with RLS acting as an inactive safety net.
5. Extend RLS unit/integration tests to verify that request-context queries are denied cross-tenant access when executing through endpoints wrapped in `withTenantRls`.

## Acceptance criteria
- [ ] Multi-tenant API routes execute queries inside the `withTenantRls` boundary when production RLS enforcement is enabled.
- [ ] Database connections connect securely as the `app_rls` role if `DATABASE_RLS_ENFORCED=true`.
- [ ] Application falls back to standard superuser behavior cleanly without regressions if RLS enforcement is disabled.
- [ ] Unit and integration tests verify no leaks occur under RLS enforcement.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Update existing integration tests under `tests/unit/db/rls-isolation.test.ts` to cover API route execution context and verified RLS enforcement.
