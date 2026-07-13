# Known Limitations & Unresolved Risks

Honest register of gaps that survive the current state. None block the demo-safe product; each is
either on a not-yet-live path, human-gated (see `tickets/TICKET023.md`), or a minor correctness
rough edge. New contributors should read this before extending the affected areas.

Milestone-level product gaps (public API, live provider transport, packaging, backup/restore) are in
`docs/CURRENT_STATE_MATRIX.md` and `docs/STANDALONE_ROADMAP.md` and are not repeated here.

## Provider webhooks (human-gated — TICKET023)

- **Twilio signature is validated against `request.url`.** Twilio signs the *public* callback URL; a
  deployment that terminates TLS at a proxy sees an internal `http://…` URL and every callback fails
  signature validation (fail-closed: inbound STOP messages and delivery statuses are dropped). Local and
  single-origin deployments are unaffected. Fixing this requires reconstructing the signed URL from a
  trusted public origin and is part of the human-reviewed webhook-hardening in
  [`tickets/TICKET023.md`](../tickets/TICKET023.md). Files: `app/api/webhooks/twilio/{inbound,status}/route.ts`.
- **Signed webhooks resolve to the demo tenant.** There is no provider-account / phone-number → tenant
  routing yet, so live multi-tenant inbound is not supported. Also TICKET023.
- **No reviewed provider retry policy** for `4xx`/`5xx`/timeout callbacks. Do not assume `Retry-After`
  triggers redelivery under provider defaults.

## Live messaging paths (off by default)

- **Idempotency of campaign re-sends after a mid-batch failure.** Outbound message dedupe is keyed on
  `(orgId, queueJobId, contactId)` (`lib/queue/idempotency.ts`). If a scheduled-campaign job fails after
  sending to some recipients and the campaign is then rescheduled for a *different* time, a brand-new
  queue job is created, so the already-messaged recipients are not deduped and could be re-sent. Harmless
  today (the worker uses the dummy provider), but must be re-keyed on `(orgId, campaignId, contactId)`
  before a live provider is enabled. A same-time reschedule reuses the generation and is safe.
- **Live-test SMS "pending" outcomes do not self-resolve.** On an ambiguous Twilio outcome the reserved
  message keeps `providerStatus: "live_test_reserved"` with no `providerMessageId`, so its status
  callback cannot be matched (`app/api/webhooks/twilio/status/route.ts` matches on `providerMessageId`)
  and the row shows pending indefinitely. The live-test path is human-gated (TICKET023); a reconciliation
  sweep or pre-persisted SID is needed before it is relied upon. Files: `lib/messaging/live-test-sms.ts`.
- **Quiet-hours are not enforced on any live send path yet.** The worker preflight
  (`lib/messaging/send-preflight.ts`) checks consent/opt-out/archive only; the quiet-hours gate
  (`lib/compliance/gates.ts`) is exercised by tests but not wired into sending. This matches the planned
  `per-recipient-send-time-checks` control in `lib/queue/live-worker-controls.ts`.

## Product correctness rough edges (demo path)

- **Contact merge can conservatively downgrade consent.** Merging into an `OPTED_IN` target that lacks
  the complete write-once evidence bundle rewrites it to `UNKNOWN` (`mergedConsentData` in
  `lib/db/repositories/contacts.ts`). This is intentional fail-closed behavior — the system never asserts
  an opt-in it cannot prove with retained evidence — but it is silent (no audit entry) and can surprise
  operators merging legacy/seeded contacts. Changing it requires a compliance review, not a quiet code
  edit, because consent evidence is write-once by contract (SPEC-009/014).
- **`campaignScheduleSchema` accepts past datetimes** (`lib/validation/campaigns.ts`); a past schedule
  fires on the next poll. This may be intentional (immediate send) but is undocumented.
- **`/api/metrics` loads all outbound message rows per scrape** (`app/api/metrics/route.ts`) rather than
  aggregating in SQL. Fine at demo scale; revisit before large tenants.

## Operational notes

- **Per-client API rate limiting requires `TRUST_PROXY=true` behind a header-overwriting ingress.**
  Without it, forwarded IP headers are treated as spoofable and all callers share one limiter bucket
  (see `lib/rate-limit/api-rate-limit.ts` and `docs/PRODUCTION_DEPLOYMENT.md`).
- **Auth hardening follow-ups** from the identity security review (rightmost-hop proxy parsing for the
  auth throttle, scrypt parameter bump toward current OWASP guidance) are tracked in
  `docs/PRODUCTION_AUTH_RBAC.md`; none are exploitable in the default posture.
