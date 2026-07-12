# Production Auth and RBAC

Built-in local identity is implemented and validated. This document authorizes that identity boundary
only; it does not authorize live SMS, billing, hosted AI, provider calls, external notifications, or a
production worker. Those capabilities retain their own roadmap and go-live gates.

## Current Boundary

Current supported auth modes: explicit demo and built-in local.

- `DEMO_MODE=true` resolves the deterministic demo principal through `getDemoSession`; it is never a
  fallback after local authentication fails.
- `DEMO_MODE=false` plus `AUTH_PROVIDER=local` resolves a keyed opaque cookie through
  `resolveLocalSession`, then rechecks the enabled user, auth generation, ACTIVE membership, selected
  organization, and current database role.
- `AUTH_PROVIDER=oidc` is a reserved optional adapter and fails closed. Clerk is not required for the
  standalone platform, and Clerk secrets and publishable keys remain absent from supported profiles.
- Built-in local auth runs only under `next build && next start`; development Flight diagnostics are not
  permitted to handle real session cookies.

## Route RBAC Matrix

The executable route matrix lives in `lib/auth/api-rbac-matrix.ts` and is checked against every mutating
API method by `tests/unit/auth/api-rbac-matrix.test.ts`.

- Role-gated mutations use `requireApiRole` with database-derived `OWNER > ADMIN > MEMBER` authority.
- Public-auth exceptions are limited to setup, login, logout, invite acceptance, and reset completion.
- Tenant roles cannot issue a user-global password reset; that route is an explicit operator boundary and
  recovery uses `npm run admin:reset-link`.
- Twilio inbound/status callbacks are signed-webhook exceptions and validate signatures before trusted
  tenant persistence.
- Every internal cookie-authenticated mutation passes its concrete `Request` through the shared authentication boundary,
  which enforces exact same-origin evidence before mutation. Specialized public
  auth handlers enforce the same origin policy before parsing credentials or bearer payloads.

Active membership status must be enforced before tenant data access. M2 additionally makes PostgreSQL
itself reject missing/foreign tenant context under a non-owner application role; route RBAC is not a
substitute for that database boundary.

## Production Local-Auth Requirements

- Use distinct, randomly generated `AUTH_SESSION_SECRET` and `AUTH_THROTTLE_SECRET` values. Rotating the
  session key intentionally signs every browser out.
- Put the app behind a trusted ingress that strips and overwrites forwarding evidence, keep its direct port
  private, and set `TRUST_PROXY=true` only for that topology.
- Bootstrap the first owner with a one-time server secret, then remove/rotate it. Use zero-argument operator
  commands for additional recovery owners and user-global password reset links.
- Use secure cookies at TLS ingress, keep every auth response non-cacheable, and preserve the database-backed
  network/identity throttles.
- Run `npm run validate`, all PostgreSQL tests, and `npm run test:e2e:local-auth:production` before release.

## Optional External-Identity Seam

The older `lib/auth/session.ts` `resolveProductionCurrentOrg` seam behind
`PRODUCTION_AUTH_ENABLED` remains compatibility/planning code; it is not the current local-auth resolver
and does not enable an external provider. `CLERK_AUTH_CONFIG_PRESENT` continues to block accidental Clerk
configuration in the demo-safe production gate. A future OIDC adapter must map a server-verified subject to
the same ACTIVE local membership/RBAC model and cannot weaken the built-in path.

This contract is checked by `npm run production-auth:check`, which is part of `npm run validate`.
