# SPEC-009 — Compliance: quiet-hours + consent evidence + 2026 privacy/terms gate

- **Status:** Partial (2026-05-29) — TCPA **quiet-hours** enforcement DONE: `lib/compliance/quiet-hours.ts` (08:00–21:00 local, fail-safe) + optional backward-compatible `quietHours` input to `evaluateMessagingHardGate` (`QUIET_HOURS` reason) + tests; committed. A2P privacy/terms-URL completeness is already enforced by `complianceProfileIsComplete`. **Deferred (needs human confirmation):** consent-evidence storage (new `Contact`/`ConsentEvent` columns) requires a Prisma **migration**; per-contact timezone + state-specific windows are future refinements. · **Priority:** P1 · **Pillar:** Features/Compliance · **Effort:** M

## Description
US SMS compliance items that are **legally/carrier required to ever send** are not yet enforced as
executable gates: TCPA **quiet hours** (8am–9pm recipient local time), **consent-evidence storage**
(number, exact timestamp, capture method, verbatim disclosure; retain ≥4 yrs), and the
**2026-06-30 A2P requirement** that campaign registration include public `PrivacyPolicyUrl` +
`TermsAndConditionsUrl`. Wire these into `evaluateMessagingHardGate` so they block live send by default
and are visible in the compliance surfaces. All demo-safe (gate + record only; no live send).

## Prereqs / deps
`lib/compliance/gates.ts`, `ComplianceProfile`/`Contact` models (exist). Strengthens the existing
hard gate; independent of auth/AI. Phase 2.

## Implementation approach
1. Migration: add consent-evidence fields to `Contact` (or a `ConsentEvent` table): `capturedAt`,
   `method`, `disclosureText`, `source`; add `privacyPolicyUrl` + `termsUrl` to `ComplianceProfile`.
2. Quiet-hours: derive recipient local time (contact timezone or area-code fallback); add a check in
   `lib/messaging/send-preflight` + `evaluateMessagingHardGate` that blocks outside 8am–9pm with a reason.
3. Consent gate: block send to contacts lacking stored consent evidence; treat evidence as immutable.
4. A2P: require non-empty valid `privacyPolicyUrl`+`termsUrl` for A2P-approved status.
5. Extend `compliance:check` to assert all three; surface blockers in `/settings/compliance` +
   `/dashboard/compliance`.

## Acceptance criteria
- [ ] Send blocked outside quiet hours (recipient local) with a clear reason; window edges covered.
- [ ] Send blocked when consent evidence is missing; evidence stored immutably with required fields.
- [ ] A2P-approved requires valid privacy + terms URLs.
- [ ] `compliance:check` enforces all three; unit tests for in/out-of-window, missing evidence, missing URL.
- [ ] Demo-safe: no live send; `npm run validate` green.

## Test strategy
Unit: timezone window boundaries (incl. state variants), missing-evidence block, missing-URL block, gate
composition. Use fixed clocks. `npm run validate`.

## Out of scope
Live TCR/Twilio registration API calls, double opt-in UX, per-state quiet-hour variants beyond the core
8am–9pm rule (note as follow-up), SHAFT content filtering.
