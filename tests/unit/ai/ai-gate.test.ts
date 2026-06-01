import { describe, expect, it } from "vitest";
import { evaluateAiHardGate, type AiHardGateInput } from "@/lib/ai/ai-gate";

describe("evaluateAiHardGate", () => {
  it("allows when all conditions are met", () => {
    const input: AiHardGateInput = {
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "test-api-key",
      costAck: "true"
    };
    const result = evaluateAiHardGate(input);
    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("denies and reports reason when AI provider is not live", () => {
    const input: AiHardGateInput = {
      aiProvider: "fake",
      liveAiEnabled: "true",
      apiKey: "test-api-key",
      costAck: "true"
    };
    const result = evaluateAiHardGate(input);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("AI_PROVIDER_NOT_LIVE");
    expect(result.reasons).toHaveLength(1);
  });

  it("denies and reports reason when live AI is disabled", () => {
    const input: AiHardGateInput = {
      aiProvider: "live",
      liveAiEnabled: "false",
      apiKey: "test-api-key",
      costAck: "true"
    };
    const result = evaluateAiHardGate(input);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("LIVE_AI_DISABLED");
    expect(result.reasons).toHaveLength(1);
  });

  it("denies and reports reason when API key is missing", () => {
    const input: AiHardGateInput = {
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "",
      costAck: "true"
    };
    const result = evaluateAiHardGate(input);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("MISSING_API_KEY");
    expect(result.reasons).toHaveLength(1);
  });

  it("denies and reports reason when API key is only whitespace", () => {
    const input: AiHardGateInput = {
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "   ",
      costAck: "true"
    };
    const result = evaluateAiHardGate(input);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("MISSING_API_KEY");
    expect(result.reasons).toHaveLength(1);
  });

  it("denies and reports reason when cost is not acknowledged", () => {
    const input: AiHardGateInput = {
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "test-api-key",
      costAck: "false"
    };
    const result = evaluateAiHardGate(input);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("COST_NOT_ACKNOWLEDGED");
    expect(result.reasons).toHaveLength(1);
  });

  it("denies and reports multiple reasons when several conditions are unmet", () => {
    const input: AiHardGateInput = {
      aiProvider: "fake",
      liveAiEnabled: "false",
      apiKey: "",
      costAck: "false"
    };
    const result = evaluateAiHardGate(input);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("AI_PROVIDER_NOT_LIVE");
    expect(result.reasons).toContain("LIVE_AI_DISABLED");
    expect(result.reasons).toContain("MISSING_API_KEY");
    expect(result.reasons).toContain("COST_NOT_ACKNOWLEDGED");
    expect(result.reasons).toHaveLength(4);
  });
});
