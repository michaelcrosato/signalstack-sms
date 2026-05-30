# SPEC-017 — Phone Number Lookup Validation Seam

- **Status:** Todo · **Priority:** P2 · **Pillar:** Quality (features) · **Effort:** M

## Description
Provide a phone number validation and cleaning seam (`lib/validation/lookup.ts`) that sanitizes phone inputs into standardized E.164 formats, validates basic format compliance, and supports detecting invalid non-mobile numbers at contact creation and import times. Includes a fast, demo-safe local parser as default, and a flag-gated live Twilio Lookup API validator for production environments.

## Prereqs / deps
None. Utilizes existing Twilio client capabilities when enabled.

## Implementation approach
1. Add `lib/validation/lookup.ts` containing the `evaluatePhoneNumberLookup()` resolver.
2. In `evaluatePhoneNumberLookup()`, execute a fast local regex/cleaning pass standardizing 10-digit US strings to `+1XXXXXXXXXX`.
3. If `LIVE_LOOKUP_ENABLED=true`, route the call to the Twilio client Lookup API (`client.lookups.v2.phoneNumbers`), fetch line-type information, and verify that the type is "mobile".
4. Update `lib/csv/import-contacts.ts` and `app/api/contacts/route.ts` to execute this lookup validation pass before insertion.
5. Invalid formats return a clean, user-friendly 400 error in the API or populate the row error in the CSV importer.
6. Write unit tests for local E.164 cleaning, validation triggers, and mocks for the live Twilio path.

## Acceptance criteria
- [ ] Contacts created through REST or CSV imports are standardized to E.164.
- [ ] Invalid phone numbers (e.g. alphanumeric or too short/long) are rejected with clear user error feedback.
- [ ] Live Lookup path is completely gated behind `LIVE_LOOKUP_ENABLED` and defaults to the local sandbox resolver.
- [ ] Unit tests cover various format validations and mock lookup payloads.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/validation/lookup.test.ts` checking standardization formatting patterns and mock error responses.
