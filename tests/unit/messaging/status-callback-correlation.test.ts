import { describe, expect, it } from "vitest";
import {
  createMessageStatusCallbackUrl,
  readMessageStatusCallbackCorrelation,
  validateMessageStatusCallbackCorrelation
} from "@/lib/messaging/status-callback-correlation";

const masterKey = Buffer.alloc(32, 7);
const binding = {
  appUrl: "https://sms.example.test/base/path?ignored=yes",
  orgId: "org_demo",
  attemptId: "attempt_demo",
  correlationId: "d9428888-122b-4f4e-8e77-9f6f8b2e9a11",
  masterKey
} as const;

describe("message status callback correlation", () => {
  it("creates a canonical HTTPS URL and validates its tenant-bound proof", () => {
    const callbackUrl = createMessageStatusCallbackUrl(binding);
    const url = new URL(callbackUrl);
    expect(url.origin).toBe("https://sms.example.test");
    expect(url.pathname).toBe("/api/webhooks/twilio/status");
    expect(url.searchParams.get("attempt")).toBe(binding.attemptId);
    expect(url.searchParams.get("correlation")).toBe(binding.correlationId);

    const correlation = readMessageStatusCallbackCorrelation(callbackUrl);
    expect(correlation).not.toBeNull();
    expect(validateMessageStatusCallbackCorrelation({
      orgId: binding.orgId,
      correlation: correlation!,
      masterKey
    })).toBe(true);
  });

  it("rejects a wrong tenant, attempt, correlation, proof, or master key", () => {
    const callbackUrl = createMessageStatusCallbackUrl(binding);
    const correlation = readMessageStatusCallbackCorrelation(callbackUrl)!;
    expect(validateMessageStatusCallbackCorrelation({
      orgId: "org_other",
      correlation,
      masterKey
    })).toBe(false);
    expect(validateMessageStatusCallbackCorrelation({
      orgId: binding.orgId,
      correlation: { ...correlation, attemptId: "attempt_other" },
      masterKey
    })).toBe(false);
    expect(validateMessageStatusCallbackCorrelation({
      orgId: binding.orgId,
      correlation: { ...correlation, correlationId: "36f8667e-03fe-4f2c-9c98-7d4bcae8f090" },
      masterKey
    })).toBe(false);
    expect(validateMessageStatusCallbackCorrelation({
      orgId: binding.orgId,
      correlation: { ...correlation, proof: `${"A".repeat(42)}B` },
      masterKey
    })).toBe(false);
    expect(validateMessageStatusCallbackCorrelation({
      orgId: binding.orgId,
      correlation,
      masterKey: Buffer.alloc(32, 8)
    })).toBe(false);
  });

  it("rejects unsafe origins and malformed or duplicate query evidence", () => {
    expect(() => createMessageStatusCallbackUrl({ ...binding, appUrl: "http://sms.example.test" }))
      .toThrow("callback origin");
    expect(() => createMessageStatusCallbackUrl({ ...binding, appUrl: "https://user@sms.example.test" }))
      .toThrow("callback origin");
    expect(readMessageStatusCallbackCorrelation("not a url")).toBeNull();

    const callbackUrl = createMessageStatusCallbackUrl(binding);
    expect(readMessageStatusCallbackCorrelation(`${callbackUrl}&attempt=other`)).toBeNull();
    expect(readMessageStatusCallbackCorrelation(`${callbackUrl}&extra=value`)).toBeNull();
    expect(readMessageStatusCallbackCorrelation(callbackUrl.replace("/status?", "/inbound?"))).toBeNull();
  });
});
