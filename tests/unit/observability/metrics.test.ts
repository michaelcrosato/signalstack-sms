import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";

describe("PII-safe and flag-gated metrics recorder", () => {
  const originalEnv = process.env.OBSERVABILITY_ENABLED;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.OBSERVABILITY_ENABLED = originalEnv;
    vi.restoreAllMocks();
  });

  it("is a no-op when OBSERVABILITY_ENABLED is not true", () => {
    process.env.OBSERVABILITY_ENABLED = "false";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    recordMetric(smsPipelineMetrics.deliveryRate, { status: "success" });

    expect(spy).not.toHaveBeenCalled();
  });

  it("logs the metric when OBSERVABILITY_ENABLED is true", () => {
    process.env.OBSERVABILITY_ENABLED = "true";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    recordMetric(smsPipelineMetrics.deliveryRate, { status: "success", backend: "database" });

    expect(spy).toHaveBeenCalledTimes(1);
    const logLine = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logLine);

    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("sms_metric_recorded");
    expect(parsed.metricName).toBe("sms.delivery.rate");
    expect(parsed.status).toBe("success");
    expect(parsed.backend).toBe("database");
  });

  it("defensively redacts PII keys (phone, body, authToken) inside metric payloads recursively", () => {
    process.env.OBSERVABILITY_ENABLED = "true";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    recordMetric(smsPipelineMetrics.failureByErrorCode, {
      errorCode: "30007",
      phone: "+15551234567",
      details: {
        body: "Your confirmation code is 123456",
        nested: {
          authToken: "secretToken123"
        }
      }
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const logLine = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logLine);

    expect(parsed.metricName).toBe("sms.failure.by_error_code");
    expect(parsed.errorCode).toBe("30007");
    expect(parsed.phone).toBe("[redacted]");
    expect(parsed.details.body).toBe("[redacted]");
    expect(parsed.details.nested.authToken).toBe("[redacted]");
  });

  it("defensively masks phone digit runs inside arbitrary payload strings", () => {
    process.env.OBSERVABILITY_ENABLED = "true";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    recordMetric(smsPipelineMetrics.webhookVerificationFailureRate, {
      status: "fail",
      reason: "mismatch with signature for +1 (555) 019-9999"
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const logLine = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logLine);

    expect(parsed.metricName).toBe("webhook.verification.failure_rate");
    expect(parsed.status).toBe("fail");
    expect(parsed.reason).not.toContain("555");
    expect(parsed.reason).toContain("[redacted]");
  });
});
