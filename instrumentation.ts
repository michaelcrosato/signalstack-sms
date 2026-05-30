import { logger, observabilityIsEnabled } from "@/lib/observability/logger";
import { registerOTel } from "@vercel/otel";

// Next.js native instrumentation hook. Observability is OFF by default and only initializes when
// OBSERVABILITY_ENABLED=true — no third-party calls, no PII, and no cost in the default/demo posture.
export async function register() {
  if (!observabilityIsEnabled()) {
    return;
  }

  logger.info("observability.init", { runtime: process.env.NEXT_RUNTIME ?? "nodejs" });

  registerOTel({ serviceName: "signalstack-sms" });
}
