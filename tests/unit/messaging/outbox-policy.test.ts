import { describe, expect, it } from "vitest";
import {
  decideClassifiedCreateError,
  decideDirectMessageCreateResult,
  DIRECT_MESSAGE_MAX_ATTEMPTS
} from "@/lib/messaging/outbox/policy";

function result(status: string, providerErrorCode: string | null = null) {
  return {
    providerMessageId: `SM${"a".repeat(32)}`,
    externalAccountId: `AC${"b".repeat(32)}`,
    status: { status, providerStatus: status },
    to: "+15555550100",
    from: "+15555550199",
    messagingServiceId: null,
    providerErrorCode
  } as Parameters<typeof decideDirectMessageCreateResult>[0];
}

describe("direct message attempt policy", () => {
  it.each(["accepted", "queued", "sending", "sent", "unknown"])(
    "treats provider %s with a SID as sent",
    (status) => {
      expect(decideDirectMessageCreateResult(result(status))).toMatchObject({ outcome: "sent" });
    }
  );

  it("recognizes immediate delivery and terminal provider failure without retry", () => {
    expect(decideDirectMessageCreateResult(result("delivered"))).toMatchObject({ outcome: "delivered" });
    expect(decideDirectMessageCreateResult(result("undelivered", "TWILIO_30003"))).toEqual({
      outcome: "failed",
      errorCode: "PROVIDER_STATUS_UNDELIVERED",
      providerErrorCode: "TWILIO_30003",
      disposition: "terminal",
      result: result("undelivered", "TWILIO_30003")
    });
  });

  it("uses bounded 5-second and 30-second definitive retry backoff", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    const classification = {
      disposition: "retryable" as const,
      retryable: true,
      safeCode: "TWILIO_20429",
      providerCode: "TWILIO_20429"
    };
    expect(decideClassifiedCreateError({ classification, attemptNumber: 1, now }))
      .toMatchObject({ outcome: "retry", nextAttemptAt: new Date(now.getTime() + 5_000) });
    expect(decideClassifiedCreateError({ classification, attemptNumber: 2, now }))
      .toMatchObject({ outcome: "retry", nextAttemptAt: new Date(now.getTime() + 30_000) });
    expect(decideClassifiedCreateError({ classification, attemptNumber: 3, now })).toEqual({
      outcome: "failed",
      errorCode: "AUTOMATIC_RETRIES_EXHAUSTED",
      providerErrorCode: "TWILIO_20429",
      disposition: "retryable"
    });
  });

  it("never turns ambiguous or malformed classification evidence into a retry", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    expect(decideClassifiedCreateError({
      classification: {
        disposition: "ambiguous",
        retryable: false,
        safeCode: "TWILIO_NETWORK_ERROR",
        providerCode: null
      },
      attemptNumber: 1,
      now
    })).toEqual({
      outcome: "ambiguous",
      errorCode: "TWILIO_NETWORK_ERROR",
      providerErrorCode: null,
      disposition: "ambiguous"
    });
    expect(decideClassifiedCreateError({
      classification: {
        disposition: "terminal",
        retryable: true,
        safeCode: "unsafe detail",
        providerCode: "unsafe detail"
      },
      attemptNumber: 1,
      now
    })).toEqual({
      outcome: "failed",
      errorCode: "PROVIDER_OPERATION_FAILED",
      providerErrorCode: null,
      disposition: "terminal"
    });
  });

  it("rejects invalid attempt counts and clocks", () => {
    const classification = {
      disposition: "retryable" as const,
      retryable: true,
      safeCode: "TWILIO_20429",
      providerCode: null
    };
    for (const attemptNumber of [0, DIRECT_MESSAGE_MAX_ATTEMPTS + 1, 1.5]) {
      expect(() => decideClassifiedCreateError({
        classification,
        attemptNumber,
        now: new Date()
      })).toThrow("attempt number");
    }
    expect(() => decideClassifiedCreateError({
      classification,
      attemptNumber: 1,
      now: new Date(Number.NaN)
    })).toThrow("clock");
  });
});
