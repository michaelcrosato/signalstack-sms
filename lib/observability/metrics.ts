import { logger, observabilityIsEnabled, redactLogContext } from "./logger";

// Stable SMS-pipeline metric identifiers (SPEC-006). Names only — the exporter wiring is deferred until
// an OpenTelemetry backend is selected (see plan/specs/SPEC-006 / plan/BACKLOG.md). Centralizing the
// names here keeps future instrumentation consistent and avoids string drift.
export const smsPipelineMetrics = Object.freeze({
  deliveryRate: "sms.delivery.rate",
  sendToDeliveredLatencyMs: "sms.delivery.latency_ms",
  queueDepth: "queue.depth",
  queueThroughput: "queue.throughput",
  failureByErrorCode: "sms.failure.by_error_code",
  webhookVerificationFailureRate: "webhook.verification.failure_rate"
} as const);

export type SmsPipelineMetricName = (typeof smsPipelineMetrics)[keyof typeof smsPipelineMetrics];

export let webhookVerificationFailuresCount = 0;

/**
 * Record an SMS pipeline metric.
 * Only works if OBSERVABILITY_ENABLED=true.
 * Defensively redacts any PII using logger redaction.
 */
export function recordMetric(name: SmsPipelineMetricName, payload: Record<string, unknown> = {}): void {
  if (!observabilityIsEnabled()) {
    return;
  }

  if (name === smsPipelineMetrics.webhookVerificationFailureRate) {
    webhookVerificationFailuresCount++;
  }

  // Redact any PII to ensure zero leakage
  const safePayload = redactLogContext(payload);

  logger.info("sms_metric_recorded", {
    metricName: name,
    ...safePayload
  });
}
