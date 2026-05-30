# SPEC-021 — Double Opt-In Workflow Seam

- **Status:** Done · **Priority:** P2 · **Pillar:** Compliance · **Effort:** M

## Description
Implement a compliant Double Opt-In (DOI) workflow seam. When a new contact is created or imported, their consent state is set to a new transitional state `PENDING_DOUBLE_OPT_IN`. The system sends an automated opt-in confirmation request. The contact must reply with a confirmation keyword (e.g. `YES`, `JOIN`) to transit to `OPTED_IN` before any automated marketing/campaign messages can be sent to them.

## Prereqs / deps
Depends on SPEC-009 (Consent Evidence and compliance gates) and Twilio webhook ingestion.

## Implementation approach
1. Add `PENDING_DOUBLE_OPT_IN` to the application-level consent status options (if not already supported).
2. Update contact creation and imports to set initial status to `PENDING_DOUBLE_OPT_IN` if explicit double opt-in is configured or required.
3. Integrate a dispatch action that enqueues/sends a double opt-in confirmation request SMS (e.g. "Please reply YES to confirm subscription to SignalStack alerts.").
4. In Twilio webhook inbound processing (`app/api/webhooks/twilio/inbound/route.ts`), check if the contact is `PENDING_DOUBLE_OPT_IN` and the incoming message is a confirmation keyword (`YES`, `JOIN`, `CONFIRM`, `Y`). If matched:
   - Transit status to `OPTED_IN`.
   - Record the consent evidence (method, date, disclosure statement).
5. Update `evaluateMessagingHardGate` compliance validator to reject campaign/outbound messaging for contacts in `PENDING_DOUBLE_OPT_IN` state.
6. Write unit tests covering state transitions, gate rejections, and mock webhook confirmations.

## Acceptance criteria
- [x] Contacts requiring double opt-in transition to `PENDING_DOUBLE_OPT_IN` upon creation/import.
- [x] Outbound messages to `PENDING_DOUBLE_OPT_IN` contacts are rejected by the messaging hard gate.
- [x] Inbound confirmation keyword triggers transition to `OPTED_IN` and records consent evidence in the database.
- [x] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/compliance/double-opt-in.test.ts` covering success paths, webhook triggers, and compliance gate behavior.
