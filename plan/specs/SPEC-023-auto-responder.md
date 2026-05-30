# SPEC-023 — TCPA Auto-responder and Opt-out Keyword Seam

- **Status:** Done · **Priority:** P1 · **Pillar:** Compliance · **Effort:** M

## Description
Provide automatic processing of standard industry opt-out keywords (`STOP`, `UNSUBSCRIBE`, `CANCEL`, `QUIT`, `END`) within Twilio inbound webhook routing. When an opt-out keyword is received from a contact, the system must immediately mark them as `OPTED_OUT`, record the consent opt-out timestamp/evidence, and trigger an automated compliance response confirming the opt-out.

## Prereqs / deps
Requires webhook ingestion routes (`app/api/webhooks/twilio/inbound`).

## Implementation approach
1. Define a list of standard opt-out keywords: `STOP`, `UNSUBSCRIBE`, `CANCEL`, `QUIT`, `END`, `REVOKE`, `OPTOUT`.
2. In Twilio inbound webhook handler (`app/api/webhooks/twilio/inbound/route.ts`), normalize the incoming body text.
3. If the incoming text matches an opt-out keyword:
   - Resolve the contact by phone number.
   - Update their `consentStatus` in the database to `OPTED_OUT`.
   - Log standard consent evidence marking the opt-out date and reason.
   - Queue/dispatch a final opt-out confirmation SMS: "You have successfully opted out. You will no longer receive messages. Reply START to opt back in."
4. Ensure this auto-responder runs cleanly inside the request transaction or worker context, defensively protecting PII.
5. Write unit tests checking keyword matching, consent status updates, and mock outbound auto-response triggers.

## Acceptance criteria
- [x] Inbound messages containing standard opt-out keywords (e.g. `STOP`) immediately set contact status to `OPTED_OUT` in the database.
- [x] Auto-responder returns a compliant opt-out confirmation message to the recipient.
- [x] Subsequent attempts to send campaign/outbound messages to this contact are blocked by the messaging hard gate.
- [x] Unit tests cover various keyword matches and database transaction updates.
- [x] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/compliance/auto-responder.test.ts` verifying keyword parser, database modifications, and auto-response message payload format.
