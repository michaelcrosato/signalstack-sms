# SPEC-030 — Built-In Identity, Onboarding, and Team Administration

- **Status:** Complete
- **Priority:** P0
- **Roadmap:** M1 in `docs/STANDALONE_ROADMAP.md`
- **External services:** none

## Goal

Replace the deterministic demo identity as the production trust boundary with first-party credentials,
opaque database sessions, explicit organization selection, and team lifecycle management. Demo mode
remains available for local demonstrations, but self-hosted production must fail closed without a valid
session and active membership.

## Data model

### AppUser changes

- `clerkUserId` becomes nullable legacy external-identity metadata; built-in users do not need it.
- Add `disabledAt`, `emailVerifiedAt`, and `authVersion` (incrementing revocation generation).
- Email is normalized and unique case-insensitively through repository normalization plus a database
  functional unique index.

### LocalCredential

- One row per user with a versioned PHC-like password hash, `passwordChangedAt`, failed-attempt counters,
  lock expiry, and timestamps.
- Password hashing uses Node `crypto.scrypt` with a random salt and bounded, versioned parameters. The
  encoded hash contains algorithm/parameters/salt/hash but never the password.

### AuthSession

- Stores a domain-separated, `AUTH_SESSION_SECRET`-keyed HMAC-SHA-256 lookup hash of a 256-bit random
  bearer token, never the raw cookie token. Key rotation intentionally signs every browser out.
- Links user and selected organization; records credential `authVersion`, created/last-seen/idle-expiry/
  absolute-expiry/revoked timestamps.
- Cookie is HttpOnly, SameSite=Lax, Path=/, Secure in production, with no organization or role claims.
- Login rotates any presented session. Password reset, suspension, or global logout revokes sessions.

### AuthToken

- Hashed, single-use, expiring token for `INVITE` and `PASSWORD_RESET` flows.
- Invite captures organization, normalized email, intended role, issuer, expiry, acceptance/revocation.
- Reset captures user, issuer/operator source, expiry, and use/revocation.
- The application can display/copy a generated link; SMTP delivery is an optional later adapter.

## Runtime modes

- `DEMO_MODE=true` — explicit deterministic demo identity; default for local demo and CI only.
- `DEMO_MODE=false` plus `AUTH_PROVIDER=local` — built-in credentials and sessions; required default for
  the standalone production profile.
- `DEMO_MODE=false` plus `AUTH_PROVIDER=oidc` — reserved optional adapter; must fail closed until implemented.

`PRODUCTION_AUTH_ENABLED` and Clerk-specific settings become deprecated compatibility inputs and must not
be required by the standalone profile.

## Bootstrap and onboarding

1. A first-run setup endpoint/page is available only when no local credential exists.
2. It requires a 32+ character `BOOTSTRAP_TOKEN` supplied as a server secret and constant-time matched.
3. The owner supplies email, display name, password, organization name, slug, and timezone.
4. One transaction creates user, credential, organization, active OWNER membership, and audit event.
5. The bootstrap path closes immediately after the first credential exists.
6. A noninteractive `admin:create` operator command supports recovery/automation and refuses default or
   command-line-logged passwords; password/token input comes from a protected environment/file/stdin seam.

## Request resolution

- One server helper resolves `raw session token -> session hash -> unrevoked/unexpired session -> enabled
  user -> active selected-org membership -> CurrentOrg` and updates bounded last-seen/idle expiry.
- Missing, malformed, expired, revoked, stale-auth-version, disabled-user, suspended-membership, or deleted
  organization evidence returns unauthenticated/forbidden without demo fallback.
- Browser pages redirect to `/login` or `/onboarding`; API handlers return stable JSON `401`/`403`.
- Middleware may reject obviously missing cookies and set headers, but every page/action/route handler
  revalidates server-side.

## UI/API surface

- `/setup`, `/login`, `/logout`, `/account`, `/organizations`, `/team`, invite acceptance, and reset pages.
- Session endpoints for login/logout/current session/global revoke.
- Organization endpoints for create/list/select.
- Team endpoints for list/invite/role/suspend/reactivate/revoke with last-owner protection.
- CSRF protection for cookie-authenticated mutations using Origin/Host validation plus a session-bound
  token where forms cannot rely on strict same-origin submission.
- Authentication responses and logs never reveal whether a non-public email exists beyond the documented
  login behavior.

## Security invariants

- No shipped default credential or bootstrap token.
- Password/token verification is constant-time after bounded parsing.
- Login/reset/invite endpoints have database-backed per-identity and per-network throttles; process-local
  rate limiting is only defense in depth.
- Sessions are opaque and revocable; roles/org IDs are always loaded from current database rows.
- An owner cannot remove/suspend/demote the final active owner.
- Invitations cannot grant OWNER unless issued by an OWNER.
- All auth and team mutations append tenant/system audit events without raw secrets or password material.
- Redirect destinations are allowlisted local paths.

## Rollout slices

1. Core crypto, models, repositories, and Postgres tests.
2. Bootstrap/login/logout/session/current-org server integration.
3. Organization selection/onboarding and route/page enforcement.
4. Team invites/roles/suspension/last-owner safety.
5. Browser E2E migration from deterministic demo identity to real local sessions in the standalone profile.

## Acceptance tests

- Password encode/verify/version/rehash and malformed-input limits.
- Session create/rotate/idle/absolute expiry/revoke/auth-version/disabled-user behavior.
- First bootstrap wins atomically; later/replayed/wrong-token setup fails.
- Login success/failure/lockout; logout and global revoke.
- Two users/two orgs: no foreign membership selection or data access.
- Invites are one-time, email-bound, expiring, revocable, and role-bounded.
- Suspended users/memberships lose access on their next server request.
- Final active owner cannot be removed or demoted under concurrent attempts.
- API returns `401`/`403`; pages redirect without an open redirect.
- Cookies carry required security attributes in production.
- No password, raw session/invite/reset token, or credential hash appears in logs/API/HTML.
- `npm run validate` and the production-build auth browser path pass.

## Exit criteria

Every non-provider browser/API route uses the verified resolver with `AUTH_PROVIDER=local`; team administration
is functional; deterministic demo fallback occurs only with explicit `DEMO_MODE=true`; the M1 roadmap row
has current unit, Postgres, static route, and browser evidence.
