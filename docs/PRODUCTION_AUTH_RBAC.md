# Production Auth and RBAC Plan

This is a planning and validation boundary only. It does not authorize production auth, Clerk calls, invitations, role changes, live messaging, billing, notifications, provider calls, or real customer access.

## Current Boundary

Current supported auth mode: deterministic demo session.

- `getOrCreateCurrentOrg` resolves the local demo organization and user through `getDemoSession`.
- The demo organization remains `demoMode: true`.
- The local app membership model is already canonical: `Organization`, `AppUser`, and `Membership`.
- `requireApiRole` enforces the local `OWNER > ADMIN > MEMBER` role hierarchy for API mutations that already accept local demo actions.
- The `/settings/team` surface is read-only and must not invite users, create users, change roles, suspend members, delete memberships, call Clerk, send email, send notifications, call providers, create billing records, send SMS, or enable live messaging.

## Route RBAC Matrix

The executable current route matrix lives in `lib/auth/api-rbac-matrix.ts` and is covered by `tests/unit/auth/api-rbac-matrix.test.ts`.

- Admin-gated local mutations include contacts, imports, templates, campaign create/update/preflight/schedule/cancel, compliance settings, provider number and credential metadata, local usage records, local demo inbound, gated live-test SMS, campaign-copy fake AI, and conversation assignment.
- Member-gated local mutations include conversation messages, internal notes, conversation resolve/reopen, reply suggestions, conversation summaries, and lead qualification.
- Twilio inbound and status webhooks are the only mutating route exceptions; they remain signed-webhook routes and must validate the Twilio signature before tenant-local persistence.
- The matrix is planning and validation evidence only. It does not authorize production auth, new roles, invitations, role changes, live messaging, billing, notifications, provider calls, or real customer access.

## Production Auth Requirements

Before production auth can be enabled, the app must add all of these controls behind tests and the protected local gate:

- Verify the provider session server-side before tenant resolution.
- Map verified provider user IDs and organization IDs to local `AppUser` and `Organization` rows.
- Fail closed when the requester has no active local membership in the selected organization.
- Active membership status must be enforced before tenant data access.
- Every mutating API route must resolve the current organization and pass role authorization before reading a request body.
- Reads must remain tenant-scoped by the resolved organization.
- Owner-only and admin-only actions must be documented in a route RBAC matrix before implementation.
- Production user provisioning, invitations, role changes, suspensions, and membership deletion require explicit owner-only APIs and tests before any UI exposes them.
- Clerk secrets and publishable keys must remain absent from production-like demo deployments.
- No Clerk calls, invitations, role changes, suspensions, email, notifications, provider calls, billing records, live SMS, or live feature enablement are allowed by this plan.

## Demo Deployment Gate

The current production-like demo deployment class uses the local demo session only. `npm run production:gate` blocks Clerk auth configuration in production-like demo environments with `CLERK_AUTH_CONFIG_PRESENT` unless a future controlled live-auth deployment explicitly expands the gate.

This plan is checked by `npm run production-auth:check`, and that check is part of `npm run validate`.
