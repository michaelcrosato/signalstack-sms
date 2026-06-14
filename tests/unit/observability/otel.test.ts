import { beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { registerOTel } from "@vercel/otel";

vi.mock("@vercel/otel", () => ({
  registerOTel: vi.fn()
}));

describe("OpenTelemetry Exporter Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not register OTel if OBSERVABILITY_ENABLED is false", async () => {
    vi.stubEnv("OBSERVABILITY_ENABLED", "false");
    await register();
    expect(registerOTel).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("does not register OTel if OBSERVABILITY_ENABLED is undefined", async () => {
    vi.stubEnv("OBSERVABILITY_ENABLED", "");
    await register();
    expect(registerOTel).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("registers OTel with serviceName signalstack-sms if OBSERVABILITY_ENABLED is true", async () => {
    vi.stubEnv("OBSERVABILITY_ENABLED", "true");
    await register();
    expect(registerOTel).toHaveBeenCalledWith({ serviceName: "signalstack-sms" });
    vi.unstubAllEnvs();
  });
});
