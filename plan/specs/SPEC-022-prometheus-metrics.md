# SPEC-022 — Prometheus Metrics Exporter API Seam

- **Status:** Done · **Priority:** P2 · **Pillar:** Quality · **Effort:** S

## Description
Provide a Prometheus-compatible metrics exporter endpoint at `/api/metrics` to allow standard Prometheus servers to scrape current-organization SignalStack metrics. It exports tenant-attributable, message-derived pipeline metrics in standard Prometheus plaintext exposition format, gated behind the standard `OBSERVABILITY_ENABLED` flag.

## Prereqs / deps
Depends on SPEC-006 (Observability core) and SPEC-015 (delivery metrics).

## Implementation approach
1. Create a new route `app/api/metrics/route.ts` with standard GET handler.
2. In the GET handler, verify if `OBSERVABILITY_ENABLED=true`. If disabled, return a clean `404 Not Found` or empty body.
3. Retrieve current-organization metric aggregates from tenant-scoped database rows.
4. Format the metrics in Prometheus plaintext format, documenting type and helper text:
   - `signalstack_sms_delivery_rate_total{status="delivered"}`
   - `signalstack_sms_send_latency_seconds_bucket`
   - `signalstack_sms_queue_depth`
   Signature failures are rejected before trusted tenant resolution, so their redacted observability events must not be exported as a current-organization counter.
5. Return the formatted text with header `Content-Type: text/plain; version=0.0.4`.
6. Write unit tests checking format validity, headers, and flag gating behavior.

## Acceptance criteria
- [x] GET `/api/metrics` exports plaintext metrics compliant with Prometheus exposition format.
- [x] Returns correct `Content-Type` header (`text/plain; version=0.0.4`).
- [x] The endpoint returns `404` or empty response if `OBSERVABILITY_ENABLED` is false or unset.
- [x] Unit tests cover metrics printing and flag gating rules.
- [x] Unit tests prove another tenant's messages and process-global signature-verification state are absent from the current-organization scrape.
- [x] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/observability/prometheus.test.ts` verifying string format, status codes, and environment flag logic.
