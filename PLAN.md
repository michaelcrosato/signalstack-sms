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
- Remaining production trust gaps are database tenant enforcement, demo-tenant webhook routing,
  metadata-only provider credentials, dummy-only campaign worker, and no
  public integration identity/event-delivery platform.
- Deployment is not a standalone package: current Compose contains backing services only; no hardened
  app/worker/ingress/migration/backup stack or restore proof exists.
- Live external impact remains disabled while implementation proceeds.

## Active move: M2 database-enforced tenant integrity

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

## Following dependency queue

1. M2 database-enforced tenant integrity.
2. M3 scoped API keys, `/api/v1`, OpenAPI, and durable signed customer webhooks.
3. M4 encrypted provider credentials and trusted account/number tenant routing.
4. M5 direct-message outbox and Twilio transport with ambiguity reconciliation.
5. M6 inbound/status/shared-inbox production path.
6. M7 campaign worker, audiences, throttling, DLQ/replay, and kill switches.
7. M8 compliance evidence, audit, suppression, retention, and privacy lifecycle.
8. M9 complete setup/product/admin UX and local entitlements/quotas.
9. M10 clean-host package, health/metrics, backups, restore, and upgrades.
10. M11 complete production/API/provider/container/recovery proof.

## Validation rule

Each change runs focused tests first and then attempts `npm run validate`. A milestone closes only when
its exact exit proof is current and inspectable; mocked unit coverage cannot stand in for database,
container, provider-contract, browser, or restore requirements.
