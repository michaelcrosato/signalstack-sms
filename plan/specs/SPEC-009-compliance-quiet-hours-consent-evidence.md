# SPEC-009 — Compliance: quiet-hours + consent evidence + 2026 privacy/terms gate

- **Status:** Done (2026-05-29) — TCPA **quiet-hours** enforcement DONE: `lib/compliance/quiet-hours.ts` (08:00–21:00 local, fail-safe) + optional backward-compatible `quietHours` input to `evaluateMessagingHardGate` (`QUIET_HOURS` reason) + tests; committed. A2P privacy/terms-URL completeness is already enforced by `complianceProfileIsComplete`. **Consent-evidence storage DONE (2026-05-29):** additive `Contact` columns (`consentCapturedAt` / `consentMethod` / `consentDisclosure`) via migration `20260529115853_consent_evidence` (reversible), enforced by a `CONSENT_EVIDENCE_MISSING` hard-gate reason + `hasConsentEvidence` + `compliance:check`. Future refinements (BACKLOG): write-once immutability of evidence; per-contact timezone + per-US-state quiet-hour windows. · **Priority:** P1 · **Pillar:** Features/Compliance · **Effort:** M

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
- [x] Send blocked outside quiet hours (recipient local) with a clear reason; window edges covered.
- [x] Send blocked when consent evidence is missing; evidence stored with required fields (capture timestamp + method + verbatim disclosure on `Contact`). Write-once immutability is a follow-up (BACKLOG).
- [x] A2P-approved requires valid privacy + terms URLs (`complianceProfileIsComplete`).
- [x] `compliance:check` enforces consent evidence; unit tests cover in/out-of-window, missing evidence, and missing URL.
- [x] Demo-safe: no live send. Verified db:validate/compliance:check/typecheck/lint/**418 tests**/build green + migration applied + seed reseeded real Postgres. (e2e:smoke not run — Chromium not installed; full `npm run validate` also runs e2e.)

## Test strategy
Unit: timezone window boundaries (incl. state variants), missing-evidence block, missing-URL block, gate
composition. Use fixed clocks. `npm run validate`.

## Out of scope
Live TCR/Twilio registration API calls, double opt-in UX, per-state quiet-hour variants beyond the core
8am–9pm rule (note as follow-up), SHAFT content filtering.
