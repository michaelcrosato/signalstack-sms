import { describe, expect, it } from "vitest";
import { evaluateCarrierCanaryPolicy } from "@/lib/operations/carrier-canary";

describe("Carrier Canary Policy Engine - Empirical Stress & Edge Case Harness", () => {
  const fullLiveEnv = {
    CARRIER_CANARY_AUTHORIZED: "true",
    LIVE_MESSAGING_ENABLED: "true",
    MESSAGING_PROVIDER: "twilio",
    TWILIO_ACCOUNT_SID: "AC_demo_test_account_sid_placeholder",
    TWILIO_AUTH_TOKEN: "secretauthtoken1234567890abcdef",
    TWILIO_FROM_NUMBER: "+15551234567"
  };

  describe("Cost Boundary Tests ($1.00 vs $1.01)", () => {
    it("allows exactly $1.00 cost estimate", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { estimatedCostUsd: 1.00 });
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe("authorized-live");
      expect(result.estimatedCostUsd).toBe(1.00);
    });

    it("blocks $1.01 cost estimate", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { estimatedCostUsd: 1.01 });
      expect(result.allowed).toBe(false);
      expect(result.mode).toBe("blocked");
      expect(result.reason).toContain("exceeds cost cap of $1.00 USD");
    });

    it("blocks $1.0001 cost estimate (just over boundary)", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { estimatedCostUsd: 1.0001 });
      expect(result.allowed).toBe(false);
      expect(result.mode).toBe("blocked");
    });

    it("allows $0.9999 cost estimate (just under boundary)", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { estimatedCostUsd: 0.9999 });
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe("authorized-live");
    });
  });

  describe("CARRIER_CANARY_AUTHORIZED Value Stress Testing", () => {
    const invalidAuthorizedValues = [
      "false",
      "FALSE",
      "TRUE",
      "1",
      "yes",
      "true ",
      " true",
      "invalid",
      "",
      "null",
      "undefined"
    ];

    invalidAuthorizedValues.forEach((val) => {
      it(`fails closed / falls back to demo-safe mode for CARRIER_CANARY_AUTHORIZED="${val}"`, () => {
        const result = evaluateCarrierCanaryPolicy({
          ...fullLiveEnv,
          CARRIER_CANARY_AUTHORIZED: val
        });
        expect(result.allowed).toBe(true);
        expect(result.mode).toBe("demo-safe");
        expect(result.estimatedCostUsd).toBe(0);
        expect(result.reason).toContain("CARRIER_CANARY_AUTHORIZED is false or unset");
      });
    });
  });

  describe("CI Environment Stress Testing", () => {
    const ciVars = [
      { CI: "true" },
      { CONTINUOUS_INTEGRATION: "true" },
      { GITHUB_ACTIONS: "true" },
      { CI: "true", CONTINUOUS_INTEGRATION: "true", GITHUB_ACTIONS: "true" }
    ];

    ciVars.forEach((ciEnv, idx) => {
      it(`enforces demo-safe mode in CI env variant #${idx + 1} even with live auth & credentials`, () => {
        const result = evaluateCarrierCanaryPolicy({
          ...fullLiveEnv,
          ...ciEnv
        });
        expect(result.allowed).toBe(true);
        expect(result.mode).toBe("demo-safe");
        expect(result.estimatedCostUsd).toBe(0);
        expect(result.reason).toContain("CI environment detected");
        expect(result.warnings).toContain("CARRIER_CANARY_AUTHORIZED=true ignored in CI environment.");
      });
    });

    it("handles CI=false properly without forcing demo-safe mode if authorized", () => {
      const result = evaluateCarrierCanaryPolicy({
        ...fullLiveEnv,
        CI: "false"
      });
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe("authorized-live");
    });
  });

  describe("Default Evaluation Safety (Fail-Closed / Demo-Safe)", () => {
    it("defaults to demo-safe with empty env", () => {
      const result = evaluateCarrierCanaryPolicy({});
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe("demo-safe");
      expect(result.estimatedCostUsd).toBe(0);
    });

    it("defaults to demo-safe with process.env-like object lacking canary authorization", () => {
      const result = evaluateCarrierCanaryPolicy({
        NODE_ENV: "production",
        PORT: "3000"
      });
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe("demo-safe");
      expect(result.estimatedCostUsd).toBe(0);
    });

    it("blocks live execution when authorized but missing TWILIO credentials", () => {
      const result = evaluateCarrierCanaryPolicy({
        CARRIER_CANARY_AUTHORIZED: "true",
        LIVE_MESSAGING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio"
      });
      expect(result.allowed).toBe(false);
      expect(result.mode).toBe("blocked");
      expect(result.reason).toContain("required live provider settings are incomplete");
    });
  });

  describe("Adversarial Input Boundary Mining (NaN, Infinity, Negatives)", () => {
    it("handles NaN estimatedCostUsd", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { estimatedCostUsd: NaN });
      console.log("NaN estimatedCostUsd result:", result);
    });

    it("handles Infinity estimatedCostUsd", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { estimatedCostUsd: Infinity });
      console.log("Infinity estimatedCostUsd result:", result);
      expect(result.allowed).toBe(false);
      expect(result.mode).toBe("blocked");
    });

    it("handles negative estimatedCostUsd", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { estimatedCostUsd: -5.00 });
      console.log("Negative estimatedCostUsd result:", result);
    });

    it("handles NaN messageCount", () => {
      const result = evaluateCarrierCanaryPolicy(fullLiveEnv, { messageCount: NaN });
      console.log("NaN messageCount result:", result);
    });
  });
});
