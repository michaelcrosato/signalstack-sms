# API Map

Standalone identity foundation:

- `/setup`: renders the guarded first-owner bootstrap flow without exposing the server token.
- `/login`: renders built-in credential sign-in with allowlisted local redirects.
- `/logout`: revokes the current browser session and clears both supported cookie names.
- `POST /api/auth/setup`: atomically creates the first local owner/organization and opaque session after server-only bootstrap authorization.
- `POST /api/auth/login`: authenticates built-in credentials with generic denial behavior and rotates into an opaque local session.
- `POST /api/auth/logout`: idempotently revokes the presented local session and clears supported session cookies.
- `GET /api/auth/session`: returns sanitized current-session identity, organization, role, and expiry state or `401` without demo fallback.
- `POST /api/auth/sessions/revoke-all`: revokes every local session for the authenticated user, rotates the auth generation, and clears both cookie names.
- `POST /api/auth/password-resets`: authenticates the session and then denies tenant issuance with `PASSWORD_RESET_OPERATOR_REQUIRED`; user-global reset links are created only by `npm run admin:reset-link`.
- `POST /api/auth/password-resets/complete`: public same-origin local completion consumes `LOGIN_NETWORK` before its strict body, atomically rotates the credential/auth version and revokes every session, then clears both cookie forms; all invalid token states share one secret-free denial.
- `GET /api/auth/organizations`: lists only sanitized ACTIVE organization memberships for the enabled local-session user.
- `POST /api/auth/organizations`: transactionally creates a non-demo organization, fixed ACTIVE OWNER membership, and secret-free audit event after authentication, current-organization OWNER authorization, and same-origin validation.
- `POST /api/auth/organizations/select`: switches the opaque database session to another ACTIVE membership using only the environment-appropriate HttpOnly cookie; it never accepts or returns the bearer.
- `GET /api/auth/team`: returns same-tenant ACTIVE/SUSPENDED member summaries and pending invite metadata after local-session ADMIN authorization.
- `POST /api/auth/team/invites`: creates an email-bound, hashed, expiring invite and returns its raw bearer only once inside `/invite#token=...`; OWNER is required for OWNER invitations.
- `DELETE /api/auth/team/invites/:inviteId`: revokes a pending same-tenant invite with ADMIN/OWNER bounds and no bearer disclosure.
- `POST /api/auth/team/invites/accept`: rate-limits and atomically consumes a public email-bound invite, creating a new identity/session, verifying an existing membership-less identity with its current password and auth generation, or switching the matching authenticated user's session; pre-existing invited-org membership fails closed.
- `PATCH /api/auth/team/members/:userId`: changes exactly one role or suspension state while enforcing tenant, OWNER, disabled-user, and concurrent final-owner invariants.
- `DELETE /api/auth/team/members/:userId`: revokes a same-tenant membership and its organization sessions while retaining the user and secret-free audit evidence.
- `/organizations`: renders authenticated workspace listing, creation, and current-session switching without exposing or accepting bearer identity material.
- `/team`: renders same-tenant member, invite, role, suspension, and revocation controls; it cannot issue user-global reset links.
- `/invite`: consumes a one-time invitation fragment for the matching session or a new local account.
- `/reset`: consumes a one-time reset fragment, changes the password, and invalidates every prior session.
- `/account`: displays server-derived identity and offers current/all-session revocation.

Milestone 0:

- `GET /api/health`: returns service health and demo-safe defaults.

Milestone 1:

- `GET /api/orgs/current`: returns the verified current user and selected organization; deterministic identity is limited to explicit demo mode.

Milestone 2:

- `GET /api/contacts`: lists active contacts.
- `POST /api/contacts`: creates or upserts a contact by phone.
- `GET /api/contacts/:contactId`: returns a tenant-scoped contact.
- `PATCH /api/contacts/:contactId`: updates a tenant-scoped contact.
- `DELETE /api/contacts/:contactId`: soft-archives a tenant-scoped contact.
- `POST /api/contacts/:contactId/merge`: merges another tenant-scoped contact into the target and soft-archives the source without hard deletion or external impact.
- `POST /api/contacts/imports`: imports contacts from local CSV text.

Milestone 3:

- `GET /api/templates`: lists message templates.
- `POST /api/templates`: creates or upserts a message template.
- `GET /api/templates/:templateId`: returns one tenant-scoped message template.
- `PATCH /api/templates/:templateId`: updates one tenant-scoped local message template.
- `GET /api/campaigns`: lists campaigns.
- `POST /api/campaigns`: creates a draft campaign.
- `GET /api/campaigns/:campaignId`: reads a tenant-scoped campaign.
- `PATCH /api/campaigns/:campaignId`: updates a draft campaign.
- `POST /api/campaigns/:campaignId/preflight`: checks recipients without sending, including blocked rows for requested contact IDs that are missing or outside the current tenant.

Milestone 4:

- `POST /api/campaigns/:campaignId/schedule`: stores a queued scheduled-campaign job after preflight.
- `POST /api/campaigns/:campaignId/cancel`: atomically cancels queued jobs and pauses a still-scheduled campaign; active processing or a concurrent terminal transition returns `409` and rolls cancellation back.

Milestone 5:

- `GET /api/inbox/conversations`: lists inbox conversations.
- `POST /api/inbox/conversations`: creates demo-safe inbound messages.
- `GET /api/inbox/conversations/:conversationId`: reads one conversation.
- `GET /api/inbox/conversations/:conversationId/messages`: lists conversation messages.
- `POST /api/inbox/conversations/:conversationId/messages`: creates a demo-safe inbound message.
- `POST /api/inbox/conversations/:conversationId/reply`: records a demo-safe outbound reply via the dummy provider (opt-out/archived blocked, idempotent, no live send).
- `POST /api/inbox/conversations/:conversationId/assign`: assigns or clears conversation assignment.
- `GET /api/inbox/conversations/:conversationId/notes`: lists internal notes.
- `POST /api/inbox/conversations/:conversationId/notes`: creates an internal note.
- `POST /api/inbox/conversations/:conversationId/resolve`: resolves or reopens a conversation.
- `POST /api/demo/inbound`: creates a demo-safe inbound message.
- `GET /api/demo/live-test-sms`: returns only redacted live-test readiness counts, last-four hints, and blockers without sending or exposing full numbers or secrets.
- `POST /api/demo/live-test-sms`: reserves and sends one Twilio-backed allowlisted live-test SMS only when explicit live-test gates, confirmation, and constant-time server-only operator-token authorization pass; ambiguous provider outcomes remain pending and return `202` without resend.

Milestone 6:

- `GET /api/settings/compliance`: returns compliance profile and hard-gate checklist.
- `PATCH /api/settings/compliance`: updates compliance readiness metadata.

Milestone 7:

- `POST /api/ai/campaign-copy`: returns fake campaign copy variants and records local AI usage.
- `POST /api/ai/reply-suggestion`: returns a fake reply suggestion and records local AI usage.
- `POST /api/ai/conversation-summary`: returns a fake conversation summary and records local AI usage.
- `POST /api/ai/lead-qualification`: returns fake lead qualification and records local AI usage.

Milestone 8:

- `GET /api/analytics/overview`: returns tenant-scoped aggregate analytics, including scheduled campaign counts, outbound-only local delivered, pending, and failed message delivery breakdowns, and the latest outbound local message timestamp.
- `GET /api/billing/usage`: returns local billing metadata and usage totals.
- `POST /api/billing/usage`: records a local usage event only.

Milestone 9:

- `GET /demo`: renders the investor demo console backed by seeded local data.

Post-MVP webhook foundation:

- `POST /api/webhooks/twilio/inbound`: validates a Twilio form webhook signature, stores raw inbound payloads idempotently, and creates a local inbound inbox message under an expiring owner lease without AI or automatic replies. Active-lease conflicts return `409` with advisory `Retry-After`; processed duplicates return `204`.
- `POST /api/webhooks/twilio/status`: validates a Twilio form webhook signature and stores raw delivery-status payloads idempotently, applying local state under an expiring owner lease without provider callbacks. Active-lease conflicts return `409` with advisory `Retry-After`; processed duplicates return `204`.

Post-MVP provider settings foundation:

- `/`: renders a static local launch dashboard with demo-safe defaults and links to existing local-only admin/demo views without database access, mutations, provider calls, billing artifacts, notifications, live messaging, or secrets.
- `/dashboard`: renders a product-facing dashboard with tenant-scoped product metrics, outbound-only local message delivery rate/pending/failure/review/latest-evidence signals, local usage totals, and navigation links without mutations, delivery retries, provider calls, SMS, billing artifacts, live AI, secrets, or live messaging enablement.
- `/dashboard/contacts`: renders a product-facing contacts workspace with tenant-scoped active contacts, consent/list/tag context, metrics, and a local CSV import form backed by `POST /api/contacts/imports` without provider calls, SMS, billing, live AI, secrets, hard deletion, validation bypasses, or live messaging enablement.
- `/dashboard/contacts/:contactId`: renders a product-facing contact detail workspace with local profile, consent, notes, tags, list editing, soft archive, restore, and duplicate-merge actions backed by existing contact APIs without provider calls, SMS, billing, live AI, secrets, hard deletion, consent bypasses, or live messaging enablement.
- `/dashboard/campaigns`: renders a product-facing campaign workspace with local draft creation, compliance preflight, local schedule actions, recipient readiness, delivery review status, and latest outbound evidence timestamps backed by existing campaign APIs without provider calls, SMS, billing, live AI, secrets, worker execution, or live messaging enablement.
- `/dashboard/campaigns/:campaignId`: renders a product-facing campaign detail workspace with aggregate local recipient readiness counts, local recipient consent/archive/send-state/human-readable block-reason visibility, aggregate all-outbound campaign delivery-rate/count/review-status/last-message/provider-status/provider-error-code metrics, visible recent-evidence row count, explicit recent-row boundary copy, recent outbound message delivery metadata including provider error-code evidence, local draft edit, and queued-campaign cancellation actions backed by existing campaign APIs without provider calls, SMS, billing, live AI, notifications, secrets, worker execution, delivery retries, message delivery mutation, or live messaging enablement.
- `/dashboard/inbox`: renders a product-facing inbox workspace with tenant-scoped threads, `conversationId` query selection for visible local threads, local inbound replies, notes, assignment, and resolve/reopen actions backed by existing inbox APIs without outbound SMS, provider calls, billing, live AI, notifications, secrets, or live messaging enablement.
- `/dashboard/templates`: renders a product-facing template workspace with tenant-scoped template rows, local template creation/upsert, detected variables, and campaign usage counts backed by `GET/POST /api/templates` without live outbound rendering, provider calls, SMS, billing, live AI, secrets, or live messaging enablement.
- `/dashboard/templates/:templateId`: renders a product-facing template detail/edit workflow backed by `GET/PATCH /api/templates/:templateId` without live outbound rendering, scheduling campaigns, provider calls, SMS, billing, live AI, secrets, hard deletion, or live messaging enablement.
- `/dashboard/analytics`: renders a product-facing analytics workspace with tenant-scoped contact, campaign, scheduled-campaign, inbox, outbound-only message delivery counts, latest outbound evidence, campaign-level delivery review links, and usage totals backed by existing local analytics and campaign records without report execution, exports, mutations, delivery retries, worker execution, provider calls, Stripe calls, billing artifacts, live AI, SMS, secrets, or live feature enablement.
- `/dashboard/compliance`: renders a product-facing compliance readiness workspace with required profile fields, A2P status, runtime hard-gate blockers, and demo-safe live messaging state without registering A2P campaigns, provider calls, SMS, billing, live AI, secrets, or live feature enablement.
- `/settings`: renders the consolidated go-live readiness view, including demo operations, runtime/environment, provider-number, webhook, delivery, team, billing, reporting, AI, notification, workflow, and blocker summaries without performing external-impact actions.
- `/settings/operations`: renders the canonical grouped index for the surviving operator surfaces.
- `/settings/health`: renders the read-only health contract, demo-safe defaults, runtime blockers, and local operations links without executing probes.
- `/settings/security`: renders the read-only security boundary, production override posture, rate-limit policy, and validation references without exposing secrets or enabling live features.
- `/settings/validation`: renders the read-only local validation inventory and repair signals without executing commands or inspecting logs.
- `/settings/queue`: renders read-only scheduled-job timing, payload validity, worker settings, and queue-backend metadata without enqueueing jobs, running workers, or calling Redis/providers.
- `GET /api/settings/provider`: returns secret-safe provider readiness, live messaging blockers, and Twilio credential presence booleans.
- `PATCH /api/settings/provider`: stores local redacted Twilio credential readiness metadata without raw token persistence, provider calls, or live sends.
- `DELETE /api/settings/provider`: clears local Twilio credential readiness metadata without provider calls or live-send side effects.
- `GET /api/settings/provider/rotations`: lists recent local provider credential metadata history with optional allowlisted action filtering and bounded limits, without raw tokens, token fingerprints, provider calls, or live sends.
- `GET /api/settings/provider/rotations/export`: exports filtered local provider credential metadata history as CSV without raw tokens, token fingerprints, provider calls, billing records, notifications, live sends, or mutations.
- `/settings/provider`: renders provider details, local credential-metadata controls, redacted readiness, rotation history, and the bounded CSV export without provider calls or live-send controls.
- `/settings/compliance`: renders compliance-profile completeness, A2P status, live-message blockers, and local readiness-audit export links without mutations or provider calls.
- `/settings/readiness-audit`: renders tenant-scoped go-live readiness events, allowlisted filters, and bounded CSV export links without mutating audit events.
- `/settings/exports`: renders the allowlisted local administrative exports and their no-secret/no-mutation boundary.
- `/settings/runbook`: renders the read-only local operator checklist and command references without executing commands.
- Legacy per-area settings paths are not application routes. Their remaining readiness signals are consolidated into `/settings`; product work belongs under `/dashboard/contacts`, `/dashboard/campaigns`, `/dashboard/inbox`, `/dashboard/templates`, `/dashboard/analytics`, and `/dashboard/compliance`, while the seeded demo checkpoint is `/demo`.

Post-MVP provider number foundation:

- `GET /api/settings/numbers`: lists local provider phone-number metadata.
- `POST /api/settings/numbers`: creates or updates local provider phone-number metadata without provisioning, provider calls, or live sends.

Post-MVP live-readiness audit foundation:

- `GET /api/settings/readiness-audit`: lists recent local go-live readiness audit events with bounded `limit`, allowlisted `action`, and allowlisted `subjectType` filters.
- `GET /api/settings/readiness-audit/export`: exports filtered local go-live readiness audit events as CSV using the same allowlisted filters without secrets, provider calls, billing records, notifications, live messaging, or mutations.

Post-MVP metrics foundation:

- `GET /api/metrics`: returns current-organization, message-derived SMS pipeline metrics in standard Prometheus plaintext exposition format, gated behind `OBSERVABILITY_ENABLED=true`. It classifies `failed`, `undelivered`, and `canceled` as terminal delivery failures and omits process-global signature-failure counters that cannot be attributed to the current tenant.

Post-MVP segment synchronization foundation:

- `GET /api/contacts/segments`: lists contacts matching dynamic segment tag, consent, and lead score filters.
- `GET /api/contacts/segments/export`: exports contacts matching dynamic segment queries to CSV.

Post-MVP template validation foundation:

- `POST /api/templates/preview`: validates and returns rendered templates with substitution previews.

Post-MVP API rate limiting foundation:

- All `/api/*` routes are protected by a local in-memory rate limiter before route handlers run.
- Defaults are `API_RATE_LIMIT_ENABLED=true`, `API_RATE_LIMIT_MAX=120`, and `API_RATE_LIMIT_WINDOW_MS=60000`.
- Rate-limited responses return `429` plus retry/rate-limit headers and do not execute route-side effects.

Product API routes must be added to `contracts/CONTRACT-API.md` before implementation.
