# SPEC-010 — Postgres Row-Level Security as tenant-isolation defense-in-depth

- **Status:** Done (2026-05-29) — installed as an opt-in backstop · **Priority:** P3 · **Pillar:** Future-proofing · **Effort:** L
  - Shipped: migration `20260529130000_tenant_rls` (ENABLE + FORCE RLS + `tenant_isolation` policy on all 22
    tenant tables; non-superuser `app_rls` role + grants); `lib/db/rls.ts#withTenantRls` (transaction-local
    `set_config` + `SET LOCAL ROLE app_rls`); `tests/unit/db/rls-isolation.test.ts` (gated on `RUN_DB_TESTS`).
  - **Safe by design:** the policy allows when `app.current_org_id` is unset, so the default app path (a
    superuser/BYPASSRLS connection that never sets it) is unaffected — pure backstop, no regression.
  - **Enablement (remaining, documented):** point the app at a **non-superuser** DB role and adopt
    `withTenantRls` on request paths so RLS actually enforces in production (it currently enforces only via
    the helper, proven by the test). The migration header documents the rollback.
- **RISK:** higher — touches DB access, pooling, and transactions; mitigated by the unset-allows policy + the
  transaction-local helper (no cross-connection leak) and the no-regression verification below.

## Description
Tenant isolation is currently **application-level** (`orgId` on every query via `lib/db/tenant`). This
relies on developer discipline; one missed filter leaks cross-tenant data. Postgres **RLS** adds
DB-enforced isolation that survives app bugs — valuable as this moves toward real (non-demo) multi-tenant
PII. Adopt it as defense-in-depth **behind the existing app-level scoping**, not as a replacement.

## Prereqs / deps
TICKET009 (a reliable authenticated `orgId` in the session/DAL) and a pooling decision (PgBouncer
transaction-mode or Prisma driver adapter). Phase 4. Do after the product backbone is stable.

## Implementation approach
1. Add RLS policies (migration) on tenant tables keyed on `current_setting('app.current_org_id')`; ensure
   B-tree indexes on `orgId`.
2. Use Prisma's RLS client extension to `SET LOCAL app.current_org_id` per request from the auth context.
3. Validate `$transaction` interactions (the extension wraps in batch txns) and pooling in transaction
   mode; verify plans with `EXPLAIN ANALYZE` (RLS on).
4. Keep app-level `orgId` filters; RLS is a backstop. Add a test proving cross-tenant reads are denied at
   the DB even if an app filter is omitted.

## Acceptance criteria
- [x] RLS enabled on all 22 tenant tables (FORCE); cross-tenant access denied at DB level — proven by
      `rls-isolation.test.ts`: with the app filter omitted, `withTenantRls(orgA)` returns only orgA rows, and a
      cross-tenant insert is rejected by `WITH CHECK` (Postgres `42501`).
- [x] App-level scoping retained (no app query changed); no functional regression — 424 unit tests pass (RLS
      test skipped without `RUN_DB_TESTS`), all 12 domain gates + typecheck/lint/build/db:validate green, seed
      re-runs clean.
- [x] `$transaction` + pooling verified — `withTenantRls` uses transaction-local `set_config` + `SET LOCAL
      ROLE`, so settings never leak across pooled connections. `EXPLAIN` confirms the policy predicate is
      applied; the `orgId` B-tree index exists (the demo table is tiny so the planner picks a seq scan — the
      index backs the predicate at scale).
- [x] Migration is reversible; rollback documented (in the migration header).

## Test strategy
Integration against Postgres: set session org A, attempt to read org B rows (with and without app filter)
→ empty. Performance spot-check with `EXPLAIN ANALYZE`. Requires Postgres (CI via SPEC-002).

## Out of scope
Per-tenant DB roles (breaks pooling), schema/database-per-tenant, sharding, cross-region replication.
