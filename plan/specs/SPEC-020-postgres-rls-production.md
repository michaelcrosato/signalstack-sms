# SPEC-020 — PostgreSQL RLS Production Enablement

- **Status:** Done · **Priority:** P2 · **Pillar:** Future-proofing · **Effort:** L

## Description

M2 makes PostgreSQL an active tenant boundary rather than an optional repository backstop. Application
traffic runs through separately provisioned, non-owner, NOINHERIT web and worker logins; all 27 protected
tables force RLS and deny missing tenant/control evidence.

## Prereqs / deps

Completed after M1 built-in identity established the verified user, organization, session, and operator
control evidence used by database contexts. The earlier optional RLS foundation in SPEC-010 is superseded
by this mandatory fail-closed posture.

## Implemented boundary

1. `20260711030000_tenant_relation_integrity` adds same-tenant composite keys/foreign keys, a PII-free
   aborting preflight, and validation triggers for historical actor/subject references that must survive
   parent deletion.
2. All 40 migrations deploy through `MIGRATION_DATABASE_URL`. The table-owning migration/operator login
   may be NOSUPERUSER and NOBYPASSRLS because the NOLOGIN `signalstack_owner` capability supplies explicit
   forced-RLS access. `npm run db:provision:web` and `npm run db:provision:worker` provision distinct LOGIN
   NOINHERIT roles, revoke owner capability, and never expose the owner credential to a runtime.
3. The 27-table manifest is protected by forced RLS. Production posture rejects owners, superusers,
   BYPASSRLS, INHERIT logins, table owners, missing policies, or public table privileges. It fingerprints
   every runtime policy's name, command, role, permissiveness, `USING`, and `WITH CHECK` semantics.
4. Tenant data, identity/control work, and global worker dispatch use explicit short transactions.
   Transaction-local role and context settings cannot persist in a pooled connection. Command-specific
   `Organization`, `Membership`, and `AppUser` control policies require exact org/user/email/token/slug
   evidence and provide no control-role DELETE authority on those tables.
5. Workers claim due jobs only through `claim_due_queue_jobs`. Its function definition, ownership, fixed
   search path, ACL revocation, and worker-only grant install atomically. It uses database-derived time,
   bounds caller time skew, rejects null/out-of-range limits, leases, and tokens, and exposes neither
   `PUBLIC` execution nor ordinary table access.
6. The static boundary inventory allows only reviewed control/context seams and reports zero
   `tenant-migration-debt` direct Prisma imports.
7. Fresh-install proof applies all 40 migrations under a non-superuser/non-BYPASSRLS table owner, leaves
   no schema diff, exercises historical validation triggers and dispatch, and checks the public function
   ACL/search-path posture.

## Acceptance criteria

- [x] Same-tenant database relations and historical references reject cross-tenant forgery.
- [x] All 27 protected tables fail closed for missing or foreign tenant context.
- [x] Web and worker runtime logins are non-owner, NOINHERIT, and distinct from migration credentials.
- [x] The explicit owner capability supports a least-privileged table owner and is barred from runtimes.
- [x] Runtime attestation rejects semantically weakened tenant policies, not only missing catalog rows.
- [x] Tenant, control, and dispatch operations use explicit short transactions without pooled-state leak.
- [x] Control policies are command-specific, exact-evidence scoped, and deny control DELETE on tenant roots/users.
- [x] Queue dispatch is an atomic, database-timed, argument-bounded security-definer claim capability.
- [x] The mandatory A/B, missing-context, forgery, and pool matrix passes.
- [x] Production local-auth browser proof runs under the non-owner login.
- [x] Standalone, contract, context, and protected validation evidence is current.

## Test strategy and evidence

- `npm run test:tenant-db`: eight PostgreSQL files / 33 tests.
- Full `RUN_DB_TESTS=true` database run: 37 files / 186 tests.
- Focused auth database run: nine files / 38 tests.
- Fresh install: 40 migrations, no Prisma schema diff, least-privilege owner/trigger/dispatch/public-ACL
  proof green.
- `npm run tenant:boundary:check`: zero unauthorized, stale, or tenant migration-debt imports.
- `npm run test:e2e:local-auth:production`: production build and browser flow with separate migration
  and non-owner runtime credentials, 1/1 passing.
