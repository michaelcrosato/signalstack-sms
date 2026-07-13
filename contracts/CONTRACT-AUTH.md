# Authentication and Session Contract

Owner: platform-security.

## Modes

- `DEMO_MODE=true` uses the deterministic demo identity and may not enable a live provider.
- `DEMO_MODE=false` plus `AUTH_PROVIDER=local` uses built-in credentials and opaque sessions.
- `DEMO_MODE=false` plus `AUTH_PROVIDER=oidc` is reserved for an optional external identity adapter and
  must fail closed until configured and implemented.
- The standalone production profile uses `local` by default and does not require Clerk or another IdP.
- Built-in local auth fails closed under `next dev`. The current Next development Flight debug payload
  serializes request Cookie headers into browser-readable HTML; operators and browser proofs must use
  `next build && next start`. Demo mode remains available for `next dev` without real session bearers.

## Public API bearer credentials (M3 complete)

Public integration identity is separate from browser identity. Every protected `/api/v1` route accepts only
one exact `Authorization: Bearer ss_api_<12-base64url-prefix>_<43-base64url-secret>` header. Cookies, local
sessions, demo identity, OIDC/Clerk tokens, query-string credentials, provider signatures, and customer
webhook signatures are not fallbacks. `GET /api/v1/openapi.json` is the sole unauthenticated metadata route.

The raw 256-bit API secret is returned only by its logical creation or rotation operation; an exact
idempotent retry may reproduce that operation's authenticated-encrypted response snapshot. PostgreSQL stores only a visible
non-secret prefix and a domain-separated HMAC-SHA-256 digest keyed by the independently provisioned
`API_KEY_PEPPER`. Importing public API modules does not read secrets; the configured pepper is read and
validated only at an operation boundary. Raw keys, hashes, and client addresses never enter logs, audit
metadata, list responses, browser state, or error text. Last-use network evidence, when retained, is also a
domain-separated keyed digest.

A narrow pre-tenant control lookup may select a credential only when the transaction-local API-key hash
exactly matches the stored digest. It exposes no mutation authority. The resolved organization then enters
the normal tenant transaction, locks and rechecks the credential, rejects revocation/expiry/rotation, consumes
the PostgreSQL one-minute rate window, updates safe last-use metadata, and evaluates exact scopes before body
parsing. Missing or malformed bearer evidence returns `AUTHENTICATION_REQUIRED`. Unknown, expired, revoked,
rotated-away, or otherwise unusable credentials intentionally share `INVALID_API_KEY`; callers cannot use the
API as a credential-lifecycle oracle. Scope failure is `INSUFFICIENT_SCOPE`, exhaustion is
`RATE_LIMIT_EXCEEDED`, and control/rate storage failure is `SERVICE_UNAVAILABLE` without an unmetered fallback.

The exact non-wildcard scope catalog is defined in `lib/public-api/scopes.ts` and SPEC-031. `messages:send`
and `campaigns:send` remain separate from ordinary write scopes so future live-impact transport cannot be
gained through metadata authority. A bearer with `credentials:read|write` can inspect, rotate, or revoke only
itself. It cannot enumerate, create, rotate, or revoke another credential; tenant-wide administration remains
behind the browser ADMIN boundary.

Cookie-authenticated ADMIN users bootstrap credentials through `GET|POST /api/settings/api-keys` and
`POST|DELETE /api/settings/api-keys/:credentialId`. Browser mutations retain the shared same-origin boundary;
they are not `/api/v1` bearer requests. Create/rotate return one raw key once, list returns safe metadata only,
and revoke is terminal/idempotent. Every mutation appends secret-free tenant audit evidence.

## Provider control-plane authorization (M4)

Provider account, credential, health, discovery, import, default, disable, rotation, and revocation
mutations require a verified browser session in the current organization, at least ADMIN, and the shared
same-origin check before any request-body or secret field is read. Public API keys, demo identity outside
explicit demo mode, provider signatures, and customer-webhook signatures never authorize this control plane.

An operator-entered provider secret may exist only in an unprefilled active form/request and bounded server
operation memory. It is never server-rendered, cached, returned, logged, audited, exported, stored in
plaintext, or retained by the browser form after completion. Safe reads expose only allowlisted DTO fields;
Prisma credential/envelope rows are never serialized directly.

Twilio Account SID is a provider identifier rather than the authentication secret. The exact value may be
stored only as tenant-scoped `ProviderAccount.externalAccountId` and used in encrypted-secret AAD/routing;
browser reads, logs, audit, exports, and errors expose only redacted/last-four metadata.

Provider callbacks are not users and do not enter this ADMIN boundary. M4 callback routing uses exact
account + owned-destination candidate evidence only to select one encrypted credential, validates the
provider signature, then enters the resolved tenant and rechecks locked account/ownership/generation state.
Wrong/unknown/ambiguous/revoked evidence shares generic denial and never falls back to the current browser,
demo organization, API bearer, or installation-global environment token.

## Direct-message authorization (M5)

Public direct acceptance and cancellation require the exact `messages:send` API-key scope; public
conversation reply additionally requires `conversations:write`. These grants authorize durable tenant
reservation/cancellation only. Public HTTP routes never possess worker authority and never call a provider.
API idempotency remains bound to the authenticated credential, while the permanent domain fingerprint
prevents changed payload reuse after the response snapshot expires.

Browser inbox reply requires a verified current-organization session, at least MEMBER, and exact same origin
before parsing its UUID/body. This route may reserve one durable reply but cannot reconcile, attest, retry,
or call a provider. ADMIN delivery-attempt list/get/reconcile/attest/retry routes require a verified same-
tenant session; every mutation requires exact same origin before body parsing. Reconcile is provider fetch
only, and attestation/retry cannot bypass worker authorization or the final messaging gate.

The direct worker is a separate database capability, not a user/API credential. Only the exact authorized
`production-live-direct` deployment class and worker role may claim due attempt identities and reach the
provider-call frontier. Browser sessions, API keys, provider/customer-webhook signatures, demo identity,
installation-global live-test credentials, and the campaign worker class never substitute for that role.

## Password credentials

- Email identity is stored and looked up by a trimmed lowercase `normalizedEmail` unique key.
- Passwords must pass the product policy and are stored only as a versioned scrypt hash with random salt
  and bounded parameters. Passwords, hashes, salts, and fallback hashes never enter API responses, HTML,
  logs, audit metadata, or error text.
- Missing-account login performs one bounded fallback hash verification and returns the same public denial
  as wrong password, disabled user, missing credential, or active credential lock.
- Failed attempts and lock state update atomically only when the credential hash/change timestamp still
  matches the record verified by that attempt, so a concurrent reset cannot lock the replacement
  credential. The first failure after an expired lock starts a fresh counter; successful login clears
  prior failed/expired lock state.

## Authentication throttles

- Built-in local auth requires a dedicated server-only `AUTH_THROTTLE_SECRET` containing 32 to 256
  characters. It is validated without trimming or returning it and must not be reused as a session,
  bootstrap, provider, or encryption secret.
- `AUTH_SESSION_SECRET` and `AUTH_THROTTLE_SECRET` must be distinct; configuration errors never echo either
  value.
- Setup consumes a `SETUP_NETWORK` bucket before parsing its body. Login, public invitation acceptance,
  and public password-reset completion consume `LOGIN_NETWORK` before parsing. Credential verification
  consumes `LOGIN_EMAIL` only after the email passes normalized validation. PostgreSQL
  serializes each scope/key pair so concurrent attempts cannot exceed its fixed-window limit.
- Email and network evidence is converted to a scope-separated HMAC-SHA-256 key before persistence. Raw
  email, IP, proxy-chain, or network evidence is never stored in throttle rows.
- Only `X-Forwarded-For` is accepted as client-network evidence, and only with explicit
  `TRUST_PROXY=true`; `X-Real-IP` and `CF-Connecting-IP` are ignored. Production built-in auth requires a
  trusted ingress that strips client-supplied forwarding headers, writes the actual
  client address/host/protocol, and keeps the application port off the public network. This prevents a
  shared `0.0.0.0` fallback bucket from becoming a global authentication denial-of-service primitive.
- Non-production tests without trusted network evidence retain the fail-closed `0.0.0.0` bucket; that
  fallback is not an accepted production deployment profile.
- A blocked bucket returns the same secret-free `429` response with `Retry-After`; throttle persistence or
  configuration failure returns the generic authentication `503`. Logout and session reads are not
  throttled.

## First-owner bootstrap

- Bootstrap is available only with built-in local auth, a configured 32–192 character server-only
  `BOOTSTRAP_TOKEN`, and zero existing local credentials.
- Candidate comparison is constant-time after bounded parsing. The token is never stored, logged, returned,
  or rendered after form submission.
- A serializable transaction creates exactly one user, password credential, non-demo organization, active
  OWNER membership, and secret-free audit event. Concurrent attempts yield one success; later attempts are
  closed.
- Operators remove or rotate `BOOTSTRAP_TOKEN` immediately after first-owner creation; setup never
  reopens merely because a browser has no session.
- No image, seed, environment template, setup page, or command ships a default credential/token.

## Operator administrator creation

- `npm run admin:create` is a noninteractive recovery/automation boundary for built-in local auth. It
  requires `DEMO_MODE=false`, `AUTH_PROVIDER=local`, an explicit PostgreSQL `DATABASE_URL`, and zero
  command-line arguments. Unexpected positional or named arguments are rejected without reflection so a
  mistaken password or bootstrap token cannot enter command history, process listings, or command output.
- Non-secret identity and organization inputs use the documented `ADMIN_CREATE_*` environment keys. The
  first-owner mode reads only the server's existing `BOOTSTRAP_TOKEN` and delegates to the same serializable
  bootstrap service as `POST /api/auth/setup`. A password comes exclusively from exactly one bounded source:
  `ADMIN_CREATE_PASSWORD_FILE` or noninteractive stdin selected by `ADMIN_CREATE_PASSWORD_STDIN=true`.
  `ADMIN_CREATE_PASSWORD` and alternate bootstrap-token environment keys are refused.
- Password input is bounded to 256 UTF-8 bytes and is hashed byte-for-byte without trimming, newline
  removal, Unicode replacement, logging, or error reflection. Symlinks and non-regular password files are
  refused. On POSIX, the file must be owner-readable with no group/other permission bits; on platforms
  where ACL safety cannot be portably established, the command emits a secret-free warning.
- Existing-organization recovery selects one exact lowercase slug, refuses missing or demo organizations,
  and creates a new enabled local user, new credential, ACTIVE OWNER membership, and one secret-free
  `LOCAL_OWNER_RECOVERY_CREATED` audit event in a serializable transaction. Any pre-existing normalized
  email is a hard conflict whether or not it has a credential or is disabled; the command never overwrites
  a password, enables/adopts a user, or silently attaches a foreign identity.
- Success output contains only sanitized user ID/email, organization ID/slug, and role. Failure output uses
  stable codes and never includes password bytes, hashes, bootstrap tokens, file contents, connection
  strings, or database/filesystem error details.

## Operator password recovery

- `npm run admin:reset-link` is the only reset-issuance boundary. Tenant OWNER/ADMIN/MEMBER roles cannot
  mint a bearer that replaces a user-global credential. The zero-argument command requires local,
  non-demo mode, an explicit PostgreSQL URL, exact `ADMIN_RESET_EMAIL` and `ADMIN_RESET_ORG_SLUG`, and an
  optional bounded `ADMIN_RESET_EXPIRES_MINUTES`.
- The subject must be enabled and ACTIVE in the exact non-demo organization. Issuance serializes per user,
  revokes every prior unused reset for that user, stores only the new hash in the operator-global database
  shape, and records a null-actor audit event in each current organization membership.
- Success prints the raw `/reset#token=...` fragment exactly once with sanitized email and expiry. Failure
  emits only a stable code; database URLs, stack traces, tokens, hashes, and credential material are never
  reflected. Multi-organization identities are supported because recovery is explicitly instance-global.

## Sessions

- The browser receives a 256-bit random opaque token. PostgreSQL stores only a domain-separated
  HMAC-SHA-256 lookup hash keyed by `AUTH_SESSION_SECRET`.
- Rotating `AUTH_SESSION_SECRET` intentionally invalidates every existing browser session. Old database
  hashes become inert and users must sign in again; production local auth never falls back to legacy
  unkeyed lookup when the key is absent.
- Session rows link user and selected organization, capture the user's `authVersion`, and include idle,
  absolute, last-seen, and revocation timestamps.
- Configured idle lifetime is at least ten minutes so the bounded five-minute last-seen refresh interval
  can extend an active session before expiry; absolute lifetime must remain longer than idle lifetime.
- Resolution requires an unrevoked, unexpired session, enabled user, matching auth version, and ACTIVE
  membership in the selected organization. No failure falls back to the demo identity.
- Password reset, user suspension, or global logout increments/rechecks auth version and revokes sessions.
- The session cookie is `signalstack_session` for local HTTP and `__Host-signalstack_session` for secure
  production. It is HttpOnly, SameSite=Lax, Path=/, bounded by absolute expiry, has no Domain attribute,
  and is Secure for the `__Host-` form.
- Duplicate, malformed, control-character, or oversized Cookie evidence is rejected.
- Session creation, explicit revocation/rotation, global revocation, and organization selection write a
  secret-free tenant audit event in the same transaction as the session mutation. Public reset-bearer
  redemption records a null actor and explicit `operator_reset_bearer` authentication metadata rather than
  falsely attributing the action to the target user.

## Implemented local-auth endpoints

### `POST /api/auth/setup`

Validates bootstrap token, email, display name, password, organization name/slug/timezone. On the first
successful local bootstrap, creates the owner/org and a session, returns sanitized identity/org metadata,
and sets the session cookie. Wrong/absent token, invalid input, closed bootstrap, and unavailable auth mode
use stable secret-free errors.

### `POST /api/auth/login`

Validates normalized email/password, performs generic credential authentication, selects an ACTIVE
membership, creates a rotated session, and sets the session cookie. Public denial does not disclose which
identity/credential/membership condition failed.

### `POST /api/auth/logout`

Idempotently revokes the presented session when valid and always clears both supported session-cookie
forms. It is safe to call without a current session.

### `GET /api/auth/session`

Returns only sanitized current session/user/organization/role and expiry metadata for valid local
sessions. Missing/invalid/revoked/expired evidence returns `401` and no demo fallback.

### `POST /api/auth/sessions/revoke-all`

Requires the current local session, MEMBER authorization, and an exact same-origin request. It
increments the authenticated user's auth generation, revokes every active session for that user across
organizations under the same per-user lock used by session creation and reset, clears both browser
cookie forms, and returns only the number of revoked rows. A concurrent membership change cannot turn
the authenticated mutation into a successful no-op; failure to rotate the subject returns a sanitized
service error. Caller-supplied user identity is never accepted.

### `POST /api/auth/password-resets`

Authenticates the cookie session and then always returns non-cacheable `403
PASSWORD_RESET_OPERATOR_REQUIRED` without parsing a body. Organization roles cannot issue a bearer that
changes a user-global credential. Operators use the out-of-band `npm run admin:reset-link` command.

### `POST /api/auth/password-resets/complete`

This is the single explicit password-reset public-auth mutation. It is local-mode and exact-same-origin
only, and consumes the PostgreSQL-backed `LOGIN_NETWORK` throttle before reading its strict token/password
body. The reset fragment is never transmitted automatically; the browser must submit it in JSON. One
cheap hash-only availability lookup rejects unknown/expired/revoked/consumed bearers before scrypt; the
serializable claim transaction still rechecks all evidence after password hashing. One
serializable transaction claims an operator-global, unexpired, unrevoked, unconsumed reset, creates or replaces its user's
local credential, clears credential failures/lock, increments `authVersion`, revokes every user session,
marks the reset consumed once, and appends a null-actor secret-free audit event in every current membership
organization. Success returns only
`{ "completed": true }` and clears both supported session-cookie forms. Malformed, expired, replayed,
revoked, foreign, and mismatched evidence share one denial response without bearer, password, email, hash,
or account detail.

### `GET /api/auth/organizations`

Returns only sanitized organization identity and role summaries for the resolved enabled user's ACTIVE
memberships. Caller-provided identity is never accepted.

### `POST /api/auth/organizations`

Requires built-in local authentication, OWNER on the current session, and an exact same-origin
request before parsing. The strict body contains only normalized organization name, slug, and timezone.
Creation transactionally fixes the authenticated user as ACTIVE OWNER, creates a non-demo organization,
and records a secret-free audit event. Concurrent duplicate slugs return one success and sanitized
conflicts.

### `POST /api/auth/organizations/select`

Requires built-in local authentication, at least MEMBER on the current session, and an exact same-origin
request before parsing. The strict body contains only `organizationId`. The server reads the raw opaque
bearer only from the environment-appropriate session cookie, rechecks enabled-user ACTIVE membership,
and atomically changes that session's selected organization. It never accepts user, role, or token body
fields and does not rotate or return the bearer.

### `GET /api/auth/team`

Requires a verified built-in local session and at least ADMIN in the selected organization. Returns only
same-tenant ACTIVE/SUSPENDED member summaries and unexpired, unconsumed, unrevoked invitation summaries.
Credential hashes and raw invite/session tokens are never selected or returned.

### `POST /api/auth/team/invites`

Authentication and the current-session ADMIN gate run before local-mode and exact same-origin checks,
which run before body parsing. The strict body accepts normalized `email`, intended `role`, and bounded
`expiresInHours`. ADMIN may issue MEMBER/ADMIN invitations; only OWNER may issue OWNER invitations. A
successful response returns the sanitized invite and one one-time `/invite#token=...` fragment path. The
raw token is not persisted, logged, or returned by any later read. The installation treats OWNER/ADMIN
invite issuers as trusted identity registrars and out-of-band delivery agents; copied bearer possession is
not mailbox verification and does not set `emailVerifiedAt`.

### `DELETE /api/auth/team/invites/:inviteId`

Requires built-in local auth, current-session ADMIN, and exact same origin. Only a pending same-tenant
invitation may be revoked, and only OWNER may manage an OWNER invitation. The response contains sanitized
revocation evidence, never the bearer or stored hash.

### `POST /api/auth/team/invites/accept`

This is an explicit public-auth mutation available only in local mode. Exact same-origin validation and a
PostgreSQL-backed `LOGIN_NETWORK` throttle run before body parsing. The fragment bearer must be submitted
in the strict JSON body; URL fragments are not sent to the server automatically. A hash-only
availability lookup rejects unknown/expired/revoked/consumed bearers before any new-account
password hashing, while the serializable acceptance transaction remains authoritative. The issuer must
still be enabled, ACTIVE in the same organization, and currently allowed to grant the intended role;
demotion, suspension, or removal also revokes that issuer's pending invitations. An optional
environment-appropriate session cookie is resolved server-side. A matching enabled authenticated user
accepts without supplying credentials and has that same opaque session switched to the invited
organization. An existing identity without a usable session may submit exactly `{ token, email,
password }`; after invite preflight, its normalized-email throttle and normal credential lock policy apply,
and the transaction rechecks the proven `authVersion` under the same user lock as reset before adding the
membership. A fresh session is created only for that exact generation. A genuinely new identity supplies
display name and policy-valid password; acceptance creates the credential and ACTIVE membership, then a
configured opaque session. Any pre-existing membership in the invited organization fails closed rather
than being reactivated or having its role changed by an old invite. Manually copied invite possession does
not set `emailVerifiedAt`. The bearer, passwords, and hashes are absent from all responses.

### `PATCH /api/auth/team/members/:userId`

Requires built-in local auth, current-session ADMIN, and exact same origin before parsing a strict
discriminated body containing exactly `{ "role": ... }` or `{ "suspended": boolean }`. ADMIN can manage
MEMBER/ADMIN memberships; OWNER is required to grant or manage OWNER. Demotion, suspension, and
reactivation remain same-tenant, revoke affected organization sessions where required, and cannot remove
the final enabled ACTIVE OWNER.

### `DELETE /api/auth/team/members/:userId`

Requires built-in local auth, current-session ADMIN, and exact same origin. It revokes only a same-tenant
membership, revokes its organization sessions, retains the user and audit evidence, and enforces the same
OWNER bounds and final-active-owner invariant.

All team mutations append secret-free tenant audit events. Invite consumption and final-owner mutations
serialize in PostgreSQL so replay or concurrent requests cannot create two winners.

All auth responses use `Cache-Control: no-store`.

## Browser entry points

- `/setup` exposes first-owner setup only while local auth is selected and no local credential exists.
  It never renders the configured bootstrap token and directs completed installations to `/login`.
- `/login` submits built-in credentials to the local login endpoint and accepts only a validated local
  redirect path. Demo mode offers an explicit demo continuation without manufacturing a local session.
- `/logout` performs the same-origin logout mutation and returns the browser to `/login` after both
  supported session-cookie names are cleared.
- `/organizations` renders only the resolved user's active workspaces and submits same-origin creation
  and selection operations without accepting a browser-supplied user, role, or bearer token.
- `/team` manages same-tenant members and one-time invitation fragments. `/invite` and `/reset` remove
  supplied bearer fragments from the URL before submission; reset links originate only from the operator CLI.
- `/account` displays current server-derived identity and can revoke the current browser or every local
  session without accepting a browser-supplied user identifier.

## Authorization

- Browser/API mutations continue to enforce the current database-backed role in the route/action.
- Middleware is defense in depth only and cannot be the sole authorization gate.
- Pages redirect to local login/setup paths; APIs return stable JSON `401`/`403` without open redirects.
- Team administration must preserve at least one active OWNER and require OWNER for OWNER grants.

## Standalone identity trust boundary

- This local-auth profile is for one company-controlled installation, not mutually untrusted tenant
  administrators. OWNER/ADMIN users who can issue raw copyable invitation links are trusted to bind and
  deliver those links to the intended people. The bearer proves possession of the invitation, not control
  of an email mailbox, so manually invited identities remain unverified until a future verified-delivery
  adapter supplies independent evidence.
- Only an existing current-organization OWNER may create another organization. This prevents ordinary
  members from escalating copied-invite access into installation-wide identity-registration authority.

## Test requirements

- Crypto parsing, password hashing, token hashing, and cookie attributes.
- Serializable bootstrap and generic authentication state behavior.
- PostgreSQL uniqueness/cascade/session relations and two-user/two-organization isolation.
- Route tests for mode denial, validation, generic authentication failure, success, cookie flags, logout,
  session resolution, reset ordering/throttling/replay/session revocation, and storage failure sanitization.
- Production-build browser tests prove setup, login, logout, expiry/revocation, organization selection,
  team authorization, reset, and authenticated document cache protection for the completed M1 boundary.
- `e2e/local-auth-path.spec.ts` is the gated production-build proof. It runs only with
  `RUN_LOCAL_AUTH_E2E=true`, refuses non-loopback PostgreSQL, requires an isolated first-owner state,
  requires the dedicated `signalstack_sms_local_auth_e2e` database, disables secret-bearing Playwright
  artifacts, and deletes only its exact known identities,
  organizations, and HMAC-derived throttle keys even on failure. CI runs it in a fresh PostgreSQL job
  after the normal validation job through `npm run test:e2e:local-auth:production`.
