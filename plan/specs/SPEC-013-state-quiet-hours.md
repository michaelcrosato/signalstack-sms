# SPEC-013 — Per-US-state TCPA quiet-hour variants

- **Status:** Todo · **Priority:** P2 · **Pillar:** Features/Compliance · **Effort:** S

## Description
SPEC-009 enforces the core TCPA quiet-hours window (08:00–21:00 recipient-local). Some states mandate
tighter/shifted windows. Add per-state overrides to the quiet-hours check, defaulting to the federal 8–9
window when no state is known. Pure logic, no migration, demo-safe (gate + record only).

## Prereqs / deps
SPEC-009 quiet-hours (`lib/compliance/quiet-hours.ts`, `evaluateMessagingHardGate`). The recipient state is
supplied by the caller (optional); when absent, the federal window applies. No `Contact` schema change here.

## Implementation approach
1. Add a small `state → {startHour,endHour}` map + `quietHoursWindowForState(state?)` in
   `lib/compliance/quiet-hours.ts` (default 08:00–21:00).
2. Extend `isWithinQuietHours(now, timeZone, state?)` / `quietHoursBlockReason` to honor the state window;
   the fail-safe (block on unresolvable timezone) stays.
3. Thread an optional `state` through the gate's `quietHours` input (backward compatible).

## Acceptance criteria
- [ ] Federal default unchanged when no state is given (existing quiet-hours tests pass).
- [ ] State variants enforced at their boundaries (unit tests for tightened + shifted windows + default).
- [ ] Backward-compatible gate input; `npm run validate` green.

## Test strategy
Unit: window boundaries per state with fixed clocks; default fallback; unresolvable-tz still blocks.

## Out of scope
Adding a `Contact.state` column/migration; area-code→state inference; non-US locales.
