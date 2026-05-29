# SPEC-014 — Write-once immutability for stored consent evidence

- **Status:** Todo · **Priority:** P2 · **Pillar:** Features/Compliance · **Effort:** M

## Description
SPEC-009 stores consent evidence (`Contact.consentCapturedAt`/`consentMethod`/`consentDisclosure`). For TCPA
defensibility, captured evidence must not be silently altered. Enforce write-once at the application layer:
once evidence is set on a contact, an update that would change it to a different value is rejected (an
audited re-capture path is out of scope here). Demo-safe, no migration.

## Prereqs / deps
SPEC-009 consent-evidence (done). Contact writes go through `lib/db/repositories/contacts.ts`
(`upsertContact`) + `lib/validation/contacts.ts`.

## Implementation approach
1. In the contact update path, if existing evidence fields are already set and the update would change them
   to a different non-empty value, reject with a clear, tenant-safe error.
2. Allow setting evidence when currently empty (first capture); allow identical no-op writes; never touch
   evidence on unrelated field updates.
3. Document the rule in `CONTRACT-AI.md`/compliance docs; assert via `compliance:check` if cheap.

## Acceptance criteria
- [x] First capture allowed; later change to a different value rejected; identical write is a no-op.
- [x] Non-evidence contact fields still update normally; `npm run validate` green.
- [x] Unit tests cover first-capture, change-rejected, and no-op cases (tenant-scoped).

## Test strategy
Unit: guard behavior with a fake/mocked client for empty→set (allow), set→change (reject), same→same (allow).
No live calls.

## Out of scope
An audited re-capture/override workflow; DB-level immutability triggers; UI for evidence editing.
