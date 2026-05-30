# SPEC-019 — OpenTelemetry Exporter Integration

- **Status:** Todo · **Priority:** P2 · **Pillar:** Quality · **Effort:** S

## Description
Integrate OpenTelemetry exporter capabilities behind the existing `instrumentation.ts` observing seam. Hook in the official `@vercel/otel` package (or basic OTel Node SDK) to export structured metrics and traces to standard OTLP/OpenTelemetry backends. Must remain completely disabled and demo-safe by default, executing only when `OBSERVABILITY_ENABLED=true`.

## Prereqs / deps
Depends on SPEC-006 (Observability core seam). Requires installation of `@vercel/otel` or OTel SDK dependencies.

## Implementation approach
1. Install `@vercel/otel` dependency into `package.json`.
2. Update the root `instrumentation.ts` to call `registerOTel` from `@vercel/otel` when `OBSERVABILITY_ENABLED=true`.
3. Provide descriptive configuration instructions in `docs/PRODUCTION_OBSERVABILITY.md` explaining how to point telemetry export to popular OTLP collectors (e.g. Honeycomb, Dynatrace, or OpenTelemetry Collector).
4. Guard the execution defensively so missing OTel variables or disabled states never disrupt local next dev/build operations.
5. Add unit and/or gate tests verifying the registration logic executes properly under positive/negative flags.

## Acceptance criteria
- [ ] `@vercel/otel` is added cleanly to `package.json` dependencies.
- [ ] Root `instrumentation.ts` registers OTel hooks when `OBSERVABILITY_ENABLED=true`.
- [ ] No telemetry or network connections are initiated if `OBSERVABILITY_ENABLED=false` (demo-safe default).
- [ ] The Next.js dev server, build, and tests run with zero telemetry-induced crashes or warnings in default configuration.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/observability/otel.test.ts` verifying that `register()` behaves correctly under various environment flag states.
