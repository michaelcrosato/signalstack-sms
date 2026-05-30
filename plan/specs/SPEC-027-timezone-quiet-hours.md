# SPEC-027 — Timezone-Scoped Dynamic Quiet-Hour Dispatcher

- **Status:** Todo · **Priority:** P1 · **Pillar:** Features · **Effort:** M

## Description
SMS marketing campaigns must strictly adhere to quiet hours based on the recipient's local time. Instead of using a static server-time fallback, the system should dynamically resolve the contact's timezone from their phone number area code and evaluate the local time block before dispatching messages.

## Prereqs / deps
Requires messaging preflight / compliance hard gates (`lib/compliance/gates.ts` and `lib/compliance/quiet-hours.ts`).

## Implementation approach
1. Build a local area code to timezone mapping utility `lib/compliance/area-codes.ts` covering major US area codes (e.g. 212/646 -> America/New_York, 312 -> America/Chicago, 213/310 -> America/Los_Angeles).
2. Wire a resolver `resolveTimezoneFromPhone(phone: string): string` defaulting to `America/New_York` for unrecognized numbers.
3. Update quiet hours validation `evaluateQuietHours` in `lib/compliance/quiet-hours.ts` to accept the dynamic resolved timezone, calculating the target timezone's local hour in real-time.
4. Integrate this timezone-scoped validation directly into the messaging hard gate `evaluateMessagingHardGate`.
5. Cover with comprehensive unit tests verifying multiple area code translations, timezone-appropriate boundaries, and edge cases.

## Acceptance criteria
- [ ] Contacts' timezones are resolved accurately from their area codes.
- [ ] Quiet hours are calculated based on the recipient's local time rather than server time.
- [ ] Messages to contacts in quiet-hour zones are blocked dynamically with proper gate exceptions.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/compliance/timezone-quiet-hours.test.ts` verifying area code resolution and time comparison logic under mocked system dates.
