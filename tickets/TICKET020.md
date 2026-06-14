# TICKET020 — Hardening Twilio messaging provider integration for live pilots

- **Status:** Done (2026-06-12)
- **Priority:** P1

## Goal
Harden the Twilio SMS/MMS provider adapter to support real-world, live pilot messaging beyond the current local `/demo` surface, while maintaining fail-safe defaults and strict tenant isolation.

## Context
Currently, the `/demo` page supports a gated live-test SMS path, but broader live campaign sending remains blocked. As the codebase moves to Phase 2 (Controlled Live Readiness), the Twilio provider adapter (`lib/messaging/provider/twilio.ts`) must be hardened, supporting robust error handling, provider-status callbacks parsing, and correct message SID mapping.

## Scope
- **In:** Hardening Twilio API client wrapper, processing status callbacks, mapping provider error codes, unit tests.
- **Out:** Overriding `LIVE_MESSAGING_ENABLED` by default; Stripe billing; Clerk auth.

## Likely files
`lib/messaging/provider/twilio.ts`, `lib/messaging/twilio-webhooks.ts`, `app/api/webhooks/twilio/status/route.ts`, `tests/unit/messaging/twilio-webhooks.test.ts`.

## Steps
1. Review the current Twilio adapter logic in `lib/messaging/provider/twilio.ts`.
2. Add comprehensive error handling in Twilio API requests: handle connection timeouts, 4xx/5xx Twilio API responses, and rate limit errors cleanly.
3. Validate inbound and status-callback webhooks payload strictly using Zod (`lib/validation/webhooks.ts`).
4. Ensure provider-level errors are safely mapped to domain error codes (`PROVIDER_ERROR`, `AUTH_FAILURE`, `BAD_REQUEST`) to protect internal details while persisting audit metrics.
5. Add unit tests for successful and failing Twilio API send requests using mocked HTTP clients or fixtures.
6. Verify local gate is 100% green: `npm run validate`.

## Acceptance criteria
- [ ] Twilio provider handles request failures gracefully and does not leak auth credentials in logs.
- [ ] Webhook callback validation enforces schema checking via Zod.
- [ ] Provider error codes are correctly mapped to our internal error metrics.
- [ ] Full test coverage for new error-mapping scenarios.
- [ ] `npm run validate` runs and exits 0.

## Commands
`npm test -- twilio-webhooks`, `npm run validate`

## Risks
Credential leaks. Mitigated by strictly utilizing environment variables (`TWILIO_AUTH_TOKEN`) through config repositories and blocking logs containing key fields.

## Notes
Must stay demo-safe: do not enable `LIVE_MESSAGING_ENABLED` in default configs or files.
