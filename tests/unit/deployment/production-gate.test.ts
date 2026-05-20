import { describe, expect, it } from "vitest";
import { evaluateProductionDeploymentGate, environmentIsProductionLike } from "@/lib/deployment/production-gate";

describe("production deployment gate", () => {
  it("detects production-like environments", () => {
    expect(environmentIsProductionLike({})).toBe(false);
    expect(environmentIsProductionLike({ NODE_ENV: "test" })).toBe(false);
    expect(environmentIsProductionLike({ VERCEL_ENV: "production" })).toBe(true);
    expect(environmentIsProductionLike({ DEPLOYMENT_ENV: "prod" })).toBe(true);
  });

  it("allows demo-safe production-like defaults", () => {
    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        LIVE_MESSAGING_ENABLED: "false",
        LIVE_BILLING_ENABLED: "false",
        MESSAGING_PROVIDER: "dummy",
        AI_PROVIDER: "fake"
      })
    ).toEqual({
      productionLike: true,
      allowed: true,
      blockers: []
    });
  });

  it("blocks external-impact production-like settings without explicit future override", () => {
    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        LIVE_MESSAGING_ENABLED: "true",
        LIVE_BILLING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio",
        AI_PROVIDER: "openai",
        TWILIO_AUTH_TOKEN: "placeholder-token",
        STRIPE_SECRET_KEY: "placeholder-stripe"
      }).blockers
    ).toEqual([
      "LIVE_MESSAGING_ENABLED_TRUE",
      "LIVE_BILLING_ENABLED_TRUE",
      "LIVE_MESSAGING_PROVIDER_SELECTED",
      "LIVE_AI_PROVIDER_SELECTED",
      "TWILIO_SECRET_OR_ACCOUNT_CONFIG_PRESENT",
      "STRIPE_SECRET_CONFIG_PRESENT"
    ]);
  });

  it("keeps the explicit override isolated for future controlled deployments", () => {
    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        ALLOW_PRODUCTION_EXTERNALS: "true",
        LIVE_MESSAGING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio"
      })
    ).toEqual({
      productionLike: true,
      allowed: true,
      blockers: []
    });
  });
});
