# TICKET026 — Compliance, opt-out & data lifecycle

- **Milestone:** M8
- **Status:** Done
- **Priority:** P1

## Goal
Formalize comprehensive messaging compliance controls, registration evidence recording, append-only consent and audit ledgers, jurisdiction-aware quiet hours, rate limiting, and data retention/deletion rules.

## Context
SignalStack enforces hard compliance gates before provider invocation (`lib/compliance/gates.ts`). M8 completes the regulatory and data lifecycle layer, providing tamper-evident consent audit history, quiet hour calculation with conservative timezone fallbacks, global suppression management, and configurable PII retention policies.

## Scope
- **In:** Append-only `ConsentEvent` and `AuditEvent` records, 10DLC brand/campaign registration evidence, jurisdiction and state quiet-hour enforcement, organization/global suppression lists, message body/media retention policy enforcement and automated purge commands.
- **Out:** Manual compliance bypasses or unverified self-attestation.

## Likely files
`lib/compliance/gates.ts`, `lib/compliance/quiet-hours.ts`, `prisma/schema.prisma`, `scripts/compliance-check.ts`, `tests/unit/compliance/hard-gates.test.ts`.

## Acceptance criteria
- [x] Business and use-case registration metadata is recorded with evidence verification references.
- [x] Consent changes generate immutable append-only audit events with timestamp and source IP/channel.
- [x] Recipient local timezone quiet hours prevent automated promotional delivery during restricted hours.
- [x] Retention policy worker purges expired message bodies and raw payloads while retaining minimum required suppression evidence.
- [x] `npm run compliance:check` passes with zero violations.

## Commands
`npm run compliance:check`, `npm run standalone:check`, `npm run validate`
