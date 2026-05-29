import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, observabilityIsEnabled, redactValue } from "@/lib/observability/logger";
import { smsPipelineMetrics } from "@/lib/observability/metrics";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PII-safe observability logger", () => {
  it("redacts sensitive keys (phone, body, secrets) recursively", () => {
    const redacted = redactValue({
      orgId: "org_1",
      phone: "+15551234567",
      payload: { body: "Hi Alex, your order is ready", nested: { authToken: "abc123" } },
      list: [{ to: "+15557654321", note: "ok" }]
    }) as Record<string, unknown>;

    expect(redacted.orgId).toBe("org_1");
    expect(redacted.phone).toBe("[redacted]");
    expect((redacted.payload as Record<string, unknown>).body).toBe("[redacted]");
    expect(((redacted.payload as Record<string, unknown>).nested as Record<string, unknown>).authToken).toBe(
      "[redacted]"
    );
    expect(((redacted.list as Array<Record<string, unknown>>)[0]).to).toBe("[redacted]");
    expect(((redacted.list as Array<Record<string, unknown>>)[0]).note).toBe("ok");
  });

  it("masks phone-like digit runs inside arbitrary string values", () => {
    const redacted = redactValue({ detail: "call +1 (555) 123-4567 today" }) as Record<string, unknown>;
    expect(redacted.detail).not.toContain("555");
    expect(redacted.detail).toContain("[redacted]");
  });

  it("treats OBSERVABILITY_ENABLED as opt-in (default off)", () => {
    expect(observabilityIsEnabled({})).toBe(false);
    expect(observabilityIsEnabled({ OBSERVABILITY_ENABLED: "false" })).toBe(false);
    expect(observabilityIsEnabled({ OBSERVABILITY_ENABLED: "true" })).toBe(true);
  });

  it("emits structured JSON with no raw phone or message body", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("message.recorded", { phone: "+15551234567", body: "secret content", direction: "OUTBOUND" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain("+15551234567");
    expect(line).not.toContain("secret content");

    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("message.recorded");
    expect(parsed.phone).toBe("[redacted]");
    expect(parsed.body).toBe("[redacted]");
    expect(parsed.direction).toBe("OUTBOUND");
    expect(typeof parsed.ts).toBe("string");
  });

  it("exposes stable SMS pipeline metric names", () => {
    expect(smsPipelineMetrics.deliveryRate).toBe("sms.delivery.rate");
    expect(smsPipelineMetrics.webhookVerificationFailureRate).toBe("webhook.verification.failure_rate");
    expect(Object.isFrozen(smsPipelineMetrics)).toBe(true);
  });
});
