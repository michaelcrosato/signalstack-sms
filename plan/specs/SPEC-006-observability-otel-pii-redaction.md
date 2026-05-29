# SPEC-006 — Observability: OpenTelemetry + PII-safe structured logging (flagged)

- **Status:** Done (core, 2026-05-29) — PII-safe structured logger + recursive redactor (`lib/observability/logger.ts`), SMS metric constants (`lib/observability/metrics.ts`), flag-gated `instrumentation.ts` seam (off unless `OBSERVABILITY_ENABLED=true`), `observability:check` extended to enforce default-off + redaction; `.env.example` documents the flag. 393 unit tests green. Committed `115bb435`. OTel **exporter** wiring (`@vercel/otel`) deferred to `plan/BACKLOG.md` (needs a backend + a dependency install; the Windows Prisma `EPERM` makes `npm install` unreliable locally). · **Priority:** P2 · **Pillar:** Quality/Observability · **Effort:** M

## Description
There is no application observability: no `instrumentation.ts`, no structured logging abstraction, no error
tracking. `docs/PRODUCTION_OBSERVABILITY.md` is planning-only. Add a demo-safe, flag-gated observability
baseline that never logs PII (phone numbers, SMS bodies) — a prerequisite to handling production PII.

## Prereqs / deps
SPEC-005 (clean dep base). Pairs with the messaging/queue pipeline. Behind `OBSERVABILITY_ENABLED` flag;
default off so demo/CI behavior is unchanged.

## Implementation approach
1. Add `instrumentation.ts` using `@vercel/otel` `registerOTel()`; Next 15 has native OTel (auto HTTP /
   server-fetch / server-action / middleware spans). Init the OTel SDK in the BullMQ worker process too;
   emit a custom span per job.
2. Add a `lib/observability/logger.ts` structured JSON logger with an **allowlist redactor** — phone
   numbers and message bodies are never emitted (hash or omit). Route existing ad-hoc logging through it.
3. Optional Sentry (flag-gated): `sendDefaultPii:false`, `beforeSend`/`beforeSendTransaction` scrub.
4. Define SMS pipeline metrics: delivery rate, send→delivered latency, queue depth/throughput,
   failure-by-error-code, webhook-verify-failure rate.
5. Extend `observability:check` to assert the redactor allowlist + flag-default-off.

## Acceptance criteria
- [ ] `instrumentation.ts` present; OTel active only when `OBSERVABILITY_ENABLED=true`; default off.
- [ ] Logger redacts phone numbers + message bodies (unit-proven); no PII in any log path.
- [ ] Worker process emits per-job spans when enabled.
- [ ] `observability:check` enforces redaction + default-off; `npm run validate` green.
- [ ] No third-party calls or cost by default.

## Test strategy
Unit: redactor drops/obfuscates numbers + bodies across log levels; flag-off emits nothing new. Integration:
a sample request/job produces a span only when enabled. `npm run validate`.

## Out of scope
Choosing/standing up a vendor backend, dashboards, alerting, tracing of live provider calls (live path stays
gated).
