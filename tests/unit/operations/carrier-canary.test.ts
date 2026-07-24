import { describe, expect, it } from "vitest";
import {
  evaluateCarrierCanaryPolicy,
  MAX_CARRIER_CANARY_COST_USD,
  DEFAULT_SMS_SEGMENT_COST_USD
} from "@/lib/operations/carrier-canary";

describe("Carrier Canary Policy Engine", () => {
  it("defaults to demo-safe mode when authorization flag is absent", () => {
    const result = evaluateCarrierCanaryPolicy({});
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("demo-safe");
    expect(result.costCapUsd).toBe(MAX_CARRIER_CANARY_COST_USD);
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.reason).toContain("Demo-safe mode active");
  });

  it("forces demo-safe mode in CI environments even if authorization is requested", () => {
    const result = evaluateCarrierCanaryPolicy({
      CI: "true",
      CARRIER_CANARY_AUTHORIZED: "true"
    });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("demo-safe");
    expect(result.reason).toContain("CI environment detected");
    expect(result.warnings).toContain("CARRIER_CANARY_AUTHORIZED=true ignored in CI environment.");
  });

  it("blocks execution when estimated cost exceeds the $1.00 USD cost cap", () => {
    const result = evaluateCarrierCanaryPolicy(
      { CARRIER_CANARY_AUTHORIZED: "true" },
      { estimatedCostUsd: 1.50 }
    );
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.reason).toContain("exceeds cost cap of $1.00 USD");
  });

  it("blocks execution when cost exceeds cap via high message count", () => {
    const result = evaluateCarrierCanaryPolicy(
      { CARRIER_CANARY_AUTHORIZED: "true" },
      { messageCount: 200 } // 200 * 0.0079 = 1.58 USD > 1.00 USD
    );
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.reason).toContain("exceeds cost cap of $1.00 USD");
  });

  it("blocks execution when live authorization is claimed but provider settings are missing", () => {
    const result = evaluateCarrierCanaryPolicy({
      CARRIER_CANARY_AUTHORIZED: "true"
    });
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.reason).toContain("required live provider settings are incomplete");
  });

  it("allows live canary send when fully authorized and within cost cap", () => {
    const result = evaluateCarrierCanaryPolicy(
      {
        CARRIER_CANARY_AUTHORIZED: "true",
        LIVE_MESSAGING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "AC_demo_test_account_sid_placeholder",
        TWILIO_AUTH_TOKEN: "secretauthtoken1234567890abcdef",
        TWILIO_FROM_NUMBER: "+15551234567"
      },
      { messageCount: 5 } // 5 * 0.0079 = 0.0395 USD <= 1.00 USD
    );
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("authorized-live");
    expect(result.estimatedCostUsd).toBeCloseTo(5 * DEFAULT_SMS_SEGMENT_COST_USD, 4);
    expect(result.reason).toContain("authorized within budget cap");
  });
});
