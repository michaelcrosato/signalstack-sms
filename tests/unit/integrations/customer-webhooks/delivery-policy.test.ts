import { describe, expect, it } from "vitest";
import {
  classifyCustomerWebhookAttempt,
  customerWebhookBackoffSeconds,
  parseCustomerWebhookRetryAfter
} from "@/lib/integrations/customer-webhooks/delivery-policy";

describe("customer webhook delivery policy", () => {
  it.each([200, 201, 204, 299])("treats %i as receiver acknowledgement", (statusCode) => {
    expect(classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode })).toEqual({
      outcome: "delivered",
      reason: "acknowledged",
      retryDelaySeconds: null,
      retryAfterAccepted: false
    });
  });

  it("disables gone or DNS-unsafe endpoints without scheduling another attempt", () => {
    expect(classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode: 410 }).outcome).toBe(
      "disable"
    );
    expect(
      classifyCustomerWebhookAttempt({
        attemptNumber: 1,
        maxAttempts: 8,
        transportFailure: "unsafe-endpoint"
      })
    ).toMatchObject({ outcome: "disable", reason: "unsafe-endpoint", retryDelaySeconds: null });
  });

  it.each([408, 409, 425, 429, 500, 503, 599])("retries transient status %i with deterministic backoff", (statusCode) => {
    expect(classifyCustomerWebhookAttempt({ attemptNumber: 2, maxAttempts: 8, statusCode })).toMatchObject({
      outcome: "retry",
      reason: "retryable-status",
      retryDelaySeconds: 120
    });
  });

  it.each([300, 301, 307, 400, 401, 404, 422])("does not follow or retry permanent status %i", (statusCode) => {
    expect(classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode })).toMatchObject({
      outcome: "failed",
      reason: "permanent-status",
      retryDelaySeconds: null
    });
  });

  it("retries network/timeouts until the bounded attempt budget is exhausted", () => {
    expect(
      classifyCustomerWebhookAttempt({ attemptNumber: 7, maxAttempts: 8, transportFailure: "network" })
    ).toMatchObject({ outcome: "retry", retryDelaySeconds: 21_600 });
    expect(
      classifyCustomerWebhookAttempt({ attemptNumber: 8, maxAttempts: 8, transportFailure: "timeout" })
    ).toMatchObject({ outcome: "failed", reason: "attempts-exhausted" });
  });

  it("honors a larger valid Retry-After but clamps it and never shortens deterministic backoff", () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    expect(
      classifyCustomerWebhookAttempt({
        attemptNumber: 1,
        maxAttempts: 8,
        statusCode: 429,
        retryAfterHeader: "90",
        nowMilliseconds: now
      })
    ).toMatchObject({ retryDelaySeconds: 90, retryAfterAccepted: true });
    expect(
      classifyCustomerWebhookAttempt({
        attemptNumber: 2,
        maxAttempts: 8,
        statusCode: 503,
        retryAfterHeader: "1",
        nowMilliseconds: now
      })
    ).toMatchObject({ retryDelaySeconds: 120, retryAfterAccepted: true });
    expect(parseCustomerWebhookRetryAfter("9999999999", now)).toBe(21_600);
    expect(parseCustomerWebhookRetryAfter("Fri, 10 Jul 2026 12:02:01 GMT", now)).toBe(121);
    expect(parseCustomerWebhookRetryAfter("not-a-date", now)).toBeNull();
  });

  it("uses a frozen exponential schedule capped at six hours", () => {
    expect(Array.from({ length: 8 }, (_, index) => customerWebhookBackoffSeconds(index + 1))).toEqual([
      30,
      120,
      480,
      1_920,
      7_680,
      21_600,
      21_600,
      21_600
    ]);
  });

  it("rejects contradictory or out-of-range attempt evidence", () => {
    expect(() =>
      classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode: 200, transportFailure: "network" })
    ).toThrow("exactly one");
    expect(() => classifyCustomerWebhookAttempt({ attemptNumber: 0, maxAttempts: 8, statusCode: 500 })).toThrow(
      "bounds"
    );
    expect(() => classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode: 700 })).toThrow(
      "status"
    );
  });
});
