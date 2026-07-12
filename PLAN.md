# Plan

This is the short operational view of
[`docs/STANDALONE_ROADMAP.md`](docs/STANDALONE_ROADMAP.md). The detailed acceptance matrix, architecture,
milestone deliverables, external references, and evidence ledger live there.

## Product target

Build SignalStack into an installable SMS/MMS platform a company can run itself and call from its own
software. The core package includes web/API, worker, PostgreSQL-backed durable queues, first-party auth,
provider/number management, contacts/audiences, direct and campaign messaging, shared inbox, compliance,
analytics, public API keys, customer event webhooks, backups, and upgrades.

The only unavoidable external dependency is a carrier/network connection. Twilio is the first production
adapter. Redis, Clerk/OIDC, Stripe, hosted AI, hosted email, object storage, Vercel, and hosted monitoring
are optional adapters or accelerators, never core requirements.

## Current reality

- Local/demo product workflows and defensive backend foundations are substantial and validated.
- Built-in local identity, onboarding, team lifecycle, operator recovery, and production-session browser
  proof are complete; deterministic identity remains only in explicit demo mode.
- Database-enforced tenant integrity and the public integration identity/event-delivery platform are
  complete. M4 extends the current substrate to 51 migrations/39 protected tables with encrypted provider
  credentials, verified account/number/service ownership, safe ADMIN lifecycle, and trusted callback
  routing. `/api/v1` message acceptance remains deliberately dummy/local; the direct-message outbox and
  campaign worker remain incomplete.
- Deployment is not a standalone package: current Compose contains backing services only; no hardened
  app/worker/ingress/migration/backup stack or restore proof exists.
- Live external impact remains disabled while implementation proceeds.

## Active move: M5 durable direct messaging

### Completed: M0 — Roadmap and package safety

- Align source-of-truth docs to the standalone product contract.
- Exclude secrets and host artifacts from Docker build context.
- Add validated runtime configuration and machine-readable milestone evidence.
- Keep the existing protected gate green.

### Completed: M1 — Built-in identity vertical slice

- Password credentials with memory-hard hashing and secure reset semantics.
- Opaque hashed sessions with secure cookies, expiry, rotation, logout, and revocation.
- First-run owner bootstrap with no default password.
- Login/logout/onboarding and organization selection.
- Team invite, accept, role, suspend, and revoke workflows.
- One fail-closed current-user/current-org resolver used by pages and APIs outside explicit demo mode.
- Two-user/two-org auth and browser E2E.

### Completed: M2 — Database-enforced tenant integrity

- Same-tenant composite keys/foreign keys, a PII-free aborting preflight, and triggers for historical
  actor/subject references.
- All 40 migrations install through a table-owning credential that may be non-superuser and
  non-BYPASSRLS by selecting the explicit NOLOGIN `signalstack_owner` capability; runtime provisioning
  removes that capability and production posture rejects it.
- Forced, fail-closed RLS across all 27 protected tables, with runtime attestation of each policy's
  command, role, permissiveness, and predicate shape.
- Explicit short tenant, auth-control, and worker-dispatch transactions. Tenant-root/global-user control
  policies bind each command to exact evidence and expose no control DELETE on those tables.
- The queue claim is installed atomically as a narrow security-definer capability, uses database-derived
  time, rejects null/out-of-range arguments, revokes `PUBLIC`, and grants execution only to workers.
- Zero tenant migration-debt imports and mandatory two-tenant A/B, missing-context, forgery, and pool
  isolation proof.
- Database evidence: 37 files / 186 tests; tenant gate: eight files / 33 tests; auth database run: nine
  files / 38 tests. A fresh least-privilege install proves all migrations, historical triggers, dispatch,
  and revoked public function access; production local-auth browser proof runs under a non-owner login.

### Completed: M3 — Public API identity and customer webhooks

- One-time scoped API credentials, safe ADMIN lifecycle routes, bearer-only `/api/v1` identity, immediate
  rotation/revocation, and audit evidence.
- Stable envelopes, request IDs, errors, HMAC cursors, database-owned per-key rate windows, and encrypted
  exact idempotency replay across all mutations.
- Organization, contact, tag, list, segment, template, dummy/local message, campaign, conversation, and
  delivery-status resources with generated OpenAPI plus curl, TypeScript, and Python examples.
- Atomic allowlisted event fanout, one-time encrypted webhook signing secrets, SSRF-resistant delivery,
  bounded retry/disable/replay/rotation, and provider-callback/receiver verification examples.
- M3 checkpoint posture of 43 migrations/36 protected tables and a literal external-network proof on a
  fresh database with NOINHERIT web/worker logins and forced RLS. It boots a real Next server plus receiver
  socket, proves organization A/B HTTP denial and method/unknown-path behavior, then covers concurrent exact
  replay/status, signed receipt, forced failure, secret rotation/replay, and API-key rotation/revocation
  without a carrier call. Separate PostgreSQL/direct-handler suites retain the broader runtime-role matrix.

### Completed: M4 — Provider secrets, accounts, and owned-number routing

- Eight migrations extend the current substrate to 51 migrations/39 protected tables while preserving the
  least-privileged owner/runtime split, forced RLS, same-tenant relations, and no-diff install proof.
- Provider Auth Tokens persist only as account-hash/AAD-bound AES-256-GCM envelopes under the separately
  provisioned master key; plaintext, envelope, routing, and raw provider-error fields never enter outward
  surfaces. Legacy `ProviderCredential`/`ProviderCredentialRotation` rows remain unverified/display-only.
- Verified accounts, numbers, and messaging services support bounded ADMIN verification, rotation,
  revocation, health, discovery/import, local default/disable lifecycle, and canonical append-only
  `IntegrationAuditEvent` evidence without sending or changing provider resources.
- The complete deterministic dummy/provider factory and fixture-only Twilio boundary are covered. Signed
  routing is proven through non-owner two-account PostgreSQL resolution plus HTTP route fixtures, including
  crossed/unknown, rotated, and revoked evidence. The tenant runner is 14 files / 57 tests.

## Following dependency queue

1. M5 direct-message outbox and Twilio transport with ambiguity reconciliation.
2. M6 inbound/status/shared-inbox production path.
3. M7 campaign worker, audiences, throttling, DLQ/replay, and kill switches.
4. M8 compliance evidence, audit, suppression, retention, and privacy lifecycle.
5. M9 complete setup/product/admin UX and local entitlements/quotas.
6. M10 clean-host package, health/metrics, backups, restore, and upgrades.
7. M11 complete production/API/provider/container/recovery proof.

## Validation rule

Each change runs focused tests first and then attempts `npm run validate`. A milestone closes only when
its exact exit proof is current and inspectable; mocked unit coverage cannot stand in for database,
container, provider-contract, browser, or restore requirements.
