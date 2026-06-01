import { describe, expect, it, vi, afterEach } from "vitest";
import { readAiHardGateInput } from "@/lib/ai/ai-gate";

describe("readAiHardGateInput", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps provided environment variables correctly", () => {
    const mockEnv = {
      AI_PROVIDER: "live",
      LIVE_AI_ENABLED: "true",
      AI_API_KEY: "sk-test12345",
      AI_COST_ACK: "true"
    };

    const result = readAiHardGateInput(mockEnv);

    expect(result).toEqual({
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "sk-test12345",
      costAck: "true"
    });
  });

  it("handles missing environment variables", () => {
    const mockEnv = {};

    const result = readAiHardGateInput(mockEnv);

    expect(result).toEqual({
      aiProvider: undefined,
      liveAiEnabled: undefined,
      apiKey: undefined,
      costAck: undefined
    });
  });

  it("falls back to process.env when no argument is provided", () => {
    vi.stubEnv("AI_PROVIDER", "fake");
    vi.stubEnv("LIVE_AI_ENABLED", "false");
    vi.stubEnv("AI_API_KEY", "sk-processenv");
    vi.stubEnv("AI_COST_ACK", "false");

    const result = readAiHardGateInput();

    expect(result).toEqual({
      aiProvider: "fake",
      liveAiEnabled: "false",
      apiKey: "sk-processenv",
      costAck: "false"
    });
  });
});
