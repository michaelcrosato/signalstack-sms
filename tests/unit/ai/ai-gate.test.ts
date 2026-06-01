import { describe, expect, it } from "vitest";
import { evaluateAiHardGate } from "@/lib/ai/ai-gate";

describe("evaluateAiHardGate", () => {
  it("should allow when all conditions are met", () => {
    const result = evaluateAiHardGate({
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "sk-123456",
      costAck: "true"
    });
    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("should deny if aiProvider is not 'live'", () => {
    const result = evaluateAiHardGate({
      aiProvider: "fake",
      liveAiEnabled: "true",
      apiKey: "sk-123456",
      costAck: "true"
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("AI_PROVIDER_NOT_LIVE");
  });

  it("should deny if liveAiEnabled is not 'true'", () => {
    const result = evaluateAiHardGate({
      aiProvider: "live",
      liveAiEnabled: "false",
      apiKey: "sk-123456",
      costAck: "true"
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("LIVE_AI_DISABLED");
  });

  it("should deny if apiKey is missing or empty", () => {
    let result = evaluateAiHardGate({
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "",
      costAck: "true"
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("MISSING_API_KEY");

    result = evaluateAiHardGate({
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "   ",
      costAck: "true"
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("MISSING_API_KEY");
  });

  it("should deny if costAck is not 'true'", () => {
    const result = evaluateAiHardGate({
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "sk-123456",
      costAck: "false"
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("COST_NOT_ACKNOWLEDGED");
  });

  it("should accumulate multiple deny reasons", () => {
    const result = evaluateAiHardGate({
      aiProvider: "fake",
      liveAiEnabled: "false",
      apiKey: "",
      costAck: "false"
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual([
      "AI_PROVIDER_NOT_LIVE",
      "LIVE_AI_DISABLED",
      "MISSING_API_KEY",
      "COST_NOT_ACKNOWLEDGED"
    ]);
  });
});
