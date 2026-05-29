# TICKET009 — Clerk-backed auth/RBAC slice behind `production-auth:check`

- **Status:** Todo
- **Priority:** P1 (ULTRAPLAN Phase B / B1 — the single biggest unlock)

## Goal
Replace the hardcoded single-OWNER `lib/auth/demo-session.ts` with a real session + active-membership
resolution that, when enabled, derives the current user/org/role from Clerk and enforces it at the route
layer — while keeping a demo fallback for local/seed/e2e. Build the slice fully gated; do **not** flip it
on by default.

## Context
`lib/auth/demo-session.ts` returns a single hardcoded OWNER, so there is no session or membership
enforcement (ULTRAPLAN evidence). The RBAC matrix (`lib/auth/api-rbac-matrix.ts`) and route guard
(`lib/auth/api-authorization.ts#requireApiRole`) already exist and are exercised by
`tests/unit/auth/api-route-authorization.test.ts`; the missing piece is *who the caller is*. A
`production-auth:check` gate (`scripts/production-auth-rbac-check.ts`) and `docs/PRODUCTION_AUTH_RBAC.md`
already define the production-auth posture. Enabling live Clerk needs human-provided secrets — that flip
is a hard gate, but the gated slice + demo fallback is buildable now.

## Scope
- **In:** a session provider seam (`resolveCurrentSession`) with two implementations — demo (default) and
  Clerk (behind `PRODUCTION_AUTH_ENABLED`/Clerk env); active-membership → org/role resolution feeding
  `requireCurrentOrg()`/`requireApiRole`; unit tests for both paths; update `production-auth:check` +
  `docs/PRODUCTION_AUTH_RBAC.md` to cover the seam.
- **Out:** enabling Clerk by default; real Clerk credentials in CI; UI sign-in/sign-up screens; billing or
  multi-org switching. No live enablement without human-supplied secrets.

## Likely files
`lib/auth/demo-session.ts`, `lib/auth/current-org.ts`, `lib/auth/api-authorization.ts`,
`lib/auth/api-rbac-matrix.ts`, `middleware.ts`, `lib/env/*` (new Clerk flags, demo-safe defaults),
`scripts/production-auth-rbac-check.ts`, `docs/PRODUCTION_AUTH_RBAC.md`,
`tests/unit/auth/*.test.ts`.

## Steps
1. Define a `resolveCurrentSession()` seam returning `{ userId, orgId, role }`; keep demo impl as default.
2. Add a Clerk-backed impl selected only when `PRODUCTION_AUTH_ENABLED=true` + Clerk env present; otherwise demo.
3. Resolve active membership → org/role; wire into `requireCurrentOrg()` and `requireApiRole`.
4. Extend `production-auth:check` to assert: default is demo, live path requires the flag + env, no secret is logged.
5. Tests: demo path unchanged; flagged path resolves role from membership and denies on missing/most-restrictive membership.
6. `npm run validate`; document the enablement runbook (human-only) in `docs/PRODUCTION_AUTH_RBAC.md`.

## Acceptance criteria
- [ ] Default (no flag) behavior is byte-for-byte the existing demo OWNER session; all current auth tests pass.
- [ ] With the flag + Clerk env, the current org/role derives from active membership, not a constant.
- [ ] `requireApiRole` denials are covered for an unauthenticated and an under-privileged membership.
- [ ] `production-auth:check` enforces demo-by-default and never logs a secret; `npm run validate` green.
- [ ] No Clerk secret is committed; `.env.example` documents the new flags as demo-safe placeholders.

## Commands
`bash scripts/agent/test.sh tests/unit/auth/api-route-authorization.test.ts`, `npm run production-auth:check`, `npm run validate`

## Risks
Hard gate: live Clerk enablement needs human-provided secrets — keep `PRODUCTION_AUTH_ENABLED` off by
default and never weaken the existing RBAC matrix. Demo/seed/e2e must keep working with zero config.

## Notes
ULTRAPLAN B1. Unblocks Phase B product work (real RBAC denials in the demo→pilot path). The
fully-unblocked, no-secrets alternative for this session is TICKET003 (inbox reply).
