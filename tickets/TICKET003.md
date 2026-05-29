# TICKET003 — Demo-safe local outbound reply in the inbox

- **Status:** Todo
- **Priority:** P2

## Goal
Let an operator send a reply from `/dashboard/inbox` that is recorded as a local OUTBOUND message via the
dummy provider — closing the "no outbound reply send path" gap in `docs/CURRENT_STATE_MATRIX.md`, with
zero live external impact.

## Context
The inbox supports demo inbound, notes, assignment, and resolve/reopen, but has no outbound reply path.
This must route through the existing dummy provider + hard messaging gate, never live SMS.

## Scope
- **In:** API + repository + product projection + workspace UI for a local outbound reply; consent/opt-out + STOP recheck; idempotency; tests.
- **Out:** live/Twilio send, scheduling, bulk send, real provider credentials.

## Likely files
`app/api/inbox/conversations/[conversationId]/messages/route.ts`, `lib/db/repositories/inbox.ts`,
`lib/validation/inbox.ts`, `lib/messaging/send-preflight.ts`, `lib/product/inbox.ts`,
`app/dashboard/inbox/workspace.tsx`, `tests/unit/api/inbox-json-route.test.ts`, `tests/unit/product/inbox.test.ts`.

## Steps
1. Confirm the messaging hard gate (`lib/compliance/gates.ts`) + dummy provider path; reuse, don't bypass.
2. Add/extend the outbound branch on the conversation messages route with a Zod body; recheck consent/opt-out + STOP at send time.
3. Persist a tenant-scoped OUTBOUND `Message` via the dummy provider with an idempotency key; update conversation `lastMessageAt`.
4. Surface the reply form in `workspace.tsx` through `lib/product/inbox.ts`.
5. Add unit tests: malformed JSON → 400; opted-out/STOP recipient → blocked; happy path persists one outbound row.

## Acceptance criteria
- [ ] Reply creates exactly one local OUTBOUND `Message` (dummy provider), no live send.
- [ ] Opted-out / STOP'd contacts are blocked with a reason; no message row created.
- [ ] Duplicate submit (same idempotency key) does not double-insert.
- [ ] Unit tests cover 400, blocked, and happy path; `npm run validate` green.
- [ ] `docs/CURRENT_STATE_MATRIX.md` inbox row updated.

## Commands
`bash scripts/agent/test.sh tests/unit/api/inbox-json-route.test.ts`, `npm run validate`

## Risks
Must not weaken the messaging hard gate or consent rechecks. Keep `LIVE_MESSAGING_ENABLED` off; dummy provider only.

## Notes
Mirror the demo inbound flow in `app/api/demo/inbound/route.ts` for consistency.
