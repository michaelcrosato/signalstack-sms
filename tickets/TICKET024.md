# TICKET024 — Inbound messaging, webhook dispatch, and shared inbox completion

- **Milestone:** M6
- **Status:** Done
- **Priority:** P1

## Goal
Complete trusted inbound SMS/MMS processing, carrier signature verification, STOP/UNSTOP/HELP automated handling, shared inbox team workflow, and customer event webhook dispatch for inbound events.

## Context
M4 established trusted provider tenant routing and M5 established outbound direct messaging outbox. M6 completes the inbound side of messaging operations, allowing incoming carrier webhooks to safely map to destination tenant ownership, update consent state, and update shared inbox state without leaking context.

## Scope
- **In:** Twilio signature verification with tenant-scoped credentials, destination number verification, raw payload minimal persistence, normalized inbound message/media records, STOP/START/HELP append-only consent mutations, inbox SLA/unread/assignment/filter improvements, customer webhooks for `message.received`, `message.updated`, `conversation.updated`, `contact.consent.updated`.
- **Out:** Live carrier sends in tests; hosted AI models.

## Likely files
`app/api/webhooks/twilio/inbound/route.ts`, `lib/integrations/provider-accounts/webhook-routing.ts`, `lib/db/repositories/inbox.ts`, `lib/compliance/gates.ts`, `lib/integrations/customer-webhooks/outbox.ts`, `tests/unit/api/twilio-webhook-routes.test.ts`.

## Acceptance criteria
- [x] Twilio signature validation verifies incoming webhook authenticity with account-specific credentials before writing database records.
- [x] Destination phone number maps unambiguously to exactly one organization tenant.
- [x] STOP/UNSUBSCRIBE/CANCEL/END/QUIT keywords immediately record append-only consent revocation and block future promotional outbound.
- [x] START/UNSTOP keywords update consent state with audit evidence.
- [x] Shared inbox displays real-time assignment, unread filters, and delivery state without leaking multi-tenant data.
- [x] Customer event webhooks emit signed `message.received` and `contact.consent.updated` payloads.
- [x] Unit and route exit tests pass cleanly without live carrier network calls.

## Commands
`npm test -- twilio-webhook-routes`, `npm run standalone:check`, `npm run validate`
