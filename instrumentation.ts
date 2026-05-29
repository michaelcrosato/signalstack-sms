import { logger, observabilityIsEnabled } from "@/lib/observability/logger";

// Next.js native instrumentation hook. Observability is OFF by default and only initializes when
// OBSERVABILITY_ENABLED=true — no third-party calls, no PII, and no cost in the default/demo posture.
// The OpenTelemetry exporter wiring (@vercel/otel `registerOTel`) is intentionally deferred until a
// backend/exporter is chosen (see plan/specs/SPEC-006 and plan/BACKLOG.md); this is the seam where it
// will be invoked, behind the same flag.
export async function register() {
  if (!observabilityIsEnabled()) {
    return;
  }

  logger.info("observability.init", { runtime: process.env.NEXT_RUNTIME ?? "nodejs" });
}
