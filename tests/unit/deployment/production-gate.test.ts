import { describe, expect, it } from "vitest";
import { evaluateProductionDeploymentGate, environmentIsProductionLike } from "@/lib/deployment/production-gate";

describe("production deployment gate", () => {
  it("detects production-like environments", () => {
    expect(environmentIsProductionLike({})).toBe(false);
    expect(environmentIsProductionLike({ NODE_ENV: "test" })).toBe(false);
    expect(environmentIsProductionLike({ VERCEL_ENV: "production" })).toBe(true);
    expect(environmentIsProductionLike({ DEPLOYMENT_ENV: "prod" })).toBe(true);
  });

  it("blocks production-like demo mode without an explicit public-demo acknowledgment", () => {
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
      allowed: false,
      blockers: ["DEMO_MODE_WITHOUT_PRODUCTION_DEMO_ACK"]
    });

    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        DEMO_MODE: "true",
        MESSAGING_PROVIDER: "dummy",
        AI_PROVIDER: "fake"
      }).blockers
    ).toContain("DEMO_MODE_WITHOUT_PRODUCTION_DEMO_ACK");
  });

  it("allows production-like demo defaults once the public demo is explicitly acknowledged", () => {
    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        ALLOW_PRODUCTION_DEMO: "true",
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

  it("allows production-like deployments that disable demo mode", () => {
    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        DEMO_MODE: "false",
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
        DEMO_MODE: "false",
        LIVE_MESSAGING_ENABLED: "true",
        LIVE_TEST_SMS_ENABLED: "true",
        LIVE_BILLING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio",
        AI_PROVIDER: "openai",
        TWILIO_AUTH_TOKEN: "placeholder-token",
        STRIPE_SECRET_KEY: "placeholder-stripe",
        CLERK_SECRET_KEY: "placeholder-clerk"
      }).blockers
    ).toEqual([
      "LIVE_MESSAGING_ENABLED_TRUE",
      "LIVE_TEST_SMS_ENABLED_TRUE",
      "LIVE_BILLING_ENABLED_TRUE",
      "LIVE_MESSAGING_PROVIDER_SELECTED",
      "LIVE_AI_PROVIDER_SELECTED",
      "TWILIO_SECRET_OR_ACCOUNT_CONFIG_PRESENT",
      "STRIPE_SECRET_CONFIG_PRESENT",
      "CLERK_AUTH_CONFIG_PRESENT"
    ]);
  });

  it("keeps the explicit override isolated for future controlled deployments", () => {
    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        DEMO_MODE: "false",
        ALLOW_PRODUCTION_EXTERNALS: "true",
        LIVE_MESSAGING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio"
      })
    ).toEqual({
      productionLike: true,
      allowed: true,
      blockers: []
    });

    // The externals override must not waive the demo-mode acknowledgment: auth absence is a
    // separate decision from live-provider enablement.
    expect(
      evaluateProductionDeploymentGate({
        NODE_ENV: "production",
        ALLOW_PRODUCTION_EXTERNALS: "true",
        LIVE_MESSAGING_ENABLED: "true",
        MESSAGING_PROVIDER: "twilio"
      }).blockers
    ).toEqual(["DEMO_MODE_WITHOUT_PRODUCTION_DEMO_ACK"]);
  });
});
