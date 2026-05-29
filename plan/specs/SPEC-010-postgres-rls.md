# SPEC-010 — Postgres Row-Level Security as tenant-isolation defense-in-depth

- **Status:** Todo · **Priority:** P3 (future-proofing) · **Pillar:** Future-proofing · **Effort:** L
- **RISK:** higher — touches DB access, pooling, and transactions for every tenant query.

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
- [ ] RLS enabled on tenant tables; cross-tenant access denied at DB level (proven by test that omits the
      app filter and still gets zero rows).
- [ ] App-level scoping retained; no functional regression; `npm run validate` green.
- [ ] Pooling + `$transaction` verified; representative queries index-backed (`EXPLAIN ANALYZE`).
- [ ] Migration is reversible; rollback documented.

## Test strategy
Integration against Postgres: set session org A, attempt to read org B rows (with and without app filter)
→ empty. Performance spot-check with `EXPLAIN ANALYZE`. Requires Postgres (CI via SPEC-002).

## Out of scope
Per-tenant DB roles (breaks pooling), schema/database-per-tenant, sharding, cross-region replication.
