# SPEC-015 — SMS delivery / queue / webhook metrics counters (flag-gated)

- **Status:** Todo · **Priority:** P3 · **Pillar:** Sec/Quality (observability) · **Effort:** M

## Description
SPEC-006 added a PII-safe logger + a metrics seam (`lib/observability/metrics.ts`) behind
`OBSERVABILITY_ENABLED`. Populate it with the SMS-domain counters the research flagged: delivery rate,
send→delivered latency, queue depth, failure-by-error-code, and webhook-verify-failure rate. Counters only
(no exporter dependency); default off; never record PII (phone/body) — only codes, counts, durations.

## Prereqs / deps
SPEC-006 (`lib/observability/{logger,metrics}.ts`, `instrumentation.ts`). No migration, no new deps.

## Implementation approach
1. Define typed metric names + record helpers in `lib/observability/metrics.ts` (flag-gated no-ops when off).
2. Record at existing seams: delivery-status updates, queue worker enqueue/complete, Twilio webhook verify
   pass/fail — using only non-PII fields (error code, status, duration, depth).
3. Extend `observability:check` to assert the counters exist, are flag-gated, and carry no PII keys.

## Acceptance criteria
- [ ] Counters recorded at the named seams; default-off (no output unless `OBSERVABILITY_ENABLED=true`).
- [ ] No PII in any metric label/value (phone/body never recorded); unit-tested against the redactor allowlist.
- [ ] `observability:check` covers the counters; `npm run validate` green.

## Test strategy
Unit: each counter records the expected dimensions when enabled, no-ops when disabled, and emits no PII keys.

## Out of scope
An OTel/Prometheus exporter or backend (BACKLOG); dashboards; alerting.
