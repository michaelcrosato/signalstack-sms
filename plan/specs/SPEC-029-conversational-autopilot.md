# SPEC-029 — Two-way Conversational AI Concierge (Autopilot)

- **Status:** Todo · **Priority:** P2 · **Pillar:** Features · **Effort:** L

## Description
Take standard AI reply suggestions a step further by introducing autonomous auto-replies. When a contact responds and has the `autoPilot` flag enabled, the system should automatically invoke the AI provider seam to draft a message and send it immediately via the Twilio dummy provider, logging the consent and interaction dynamically.

## Prereqs / deps
Requires the AI provider seam (`lib/ai/provider.ts`) and inbound keyword processing loops.

## Implementation approach
1. Add an optional/nullable boolean field `autoPilot` to the `Contact` model in `prisma/schema.prisma` defaulting to `false` via a database migration.
2. In the inbound message processor (`lib/db/repositories/inbox.ts`), after recording an incoming message, check if the contact has `autoPilot` enabled.
3. If active, trigger an async auto-reply worker:
   - Call `resolveAiProvider().generateReplyDraft()` using the conversation context history.
   - Dispatch the drafted copy automatically through `dummyProvider.sendSms()` (or equivalent queue dispatch seam).
   - Log the auto-reply transaction as an `OUTBOUND` message within the conversation thread.
4. Update the contact UI details to render an "Auto-pilot Enabled" toggle.
5. Cover with unit tests verifying autopilot routing, response timing, and async error containment.

## Acceptance criteria
- [ ] Contacts can optionally have the `autoPilot` flag set.
- [ ] When autoPilot is enabled, incoming messages trigger immediate AI-generated outbound replies.
- [ ] Auto-replies are properly saved and linked to the conversation thread.
- [ ] Unit tests cover all success, toggle, and failure fallback modes.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/ai/autopilot.test.ts` verifying routing, mock replies, and database state updates.
