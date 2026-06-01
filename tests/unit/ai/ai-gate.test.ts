import { describe, expect, it } from "vitest";
import {
  evaluateAiHardGate,
  readAiHardGateInput,
  liveAiIsBlocked,
  AiHardGateInput
} from "@/lib/ai/ai-gate";

describe("AI Hard Gate", () => {
  describe("readAiHardGateInput", () => {
    it("maps environment variables correctly to AiHardGateInput", () => {
      const mockEnv = {
        AI_PROVIDER: "live",
        LIVE_AI_ENABLED: "true",
        AI_API_KEY: "secret-key",
        AI_COST_ACK: "true"
      };

      const result = readAiHardGateInput(mockEnv);

      expect(result).toEqual({
        aiProvider: "live",
        liveAiEnabled: "true",
        apiKey: "secret-key",
        costAck: "true"
      });
    });

    it("handles missing environment variables gracefully", () => {
      const mockEnv = {};
      const result = readAiHardGateInput(mockEnv);

      expect(result).toEqual({
        aiProvider: undefined,
        liveAiEnabled: undefined,
        apiKey: undefined,
        costAck: undefined
      });
    });
  });

  describe("evaluateAiHardGate", () => {
    const validConfig: AiHardGateInput = {
      aiProvider: "live",
      liveAiEnabled: "true",
      apiKey: "secret-key",
      costAck: "true"
    };

    it("allows live AI when all conditions are met", () => {
      const result = evaluateAiHardGate(validConfig);

      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("blocks when aiProvider is missing or invalid", () => {
      const result1 = evaluateAiHardGate({ ...validConfig, aiProvider: undefined });
      expect(result1.allowed).toBe(false);
      expect(result1.reasons).toContain("AI_PROVIDER_NOT_LIVE");

      const result2 = evaluateAiHardGate({ ...validConfig, aiProvider: "fake" });
      expect(result2.allowed).toBe(false);
      expect(result2.reasons).toContain("AI_PROVIDER_NOT_LIVE");
    });

    it("blocks when liveAiEnabled is missing or invalid", () => {
      const result1 = evaluateAiHardGate({ ...validConfig, liveAiEnabled: undefined });
      expect(result1.allowed).toBe(false);
      expect(result1.reasons).toContain("LIVE_AI_DISABLED");

      const result2 = evaluateAiHardGate({ ...validConfig, liveAiEnabled: "false" });
      expect(result2.allowed).toBe(false);
      expect(result2.reasons).toContain("LIVE_AI_DISABLED");
    });

    it("blocks when apiKey is missing, empty, or whitespace-only", () => {
      const result1 = evaluateAiHardGate({ ...validConfig, apiKey: undefined });
      expect(result1.allowed).toBe(false);
      expect(result1.reasons).toContain("MISSING_API_KEY");

      const result2 = evaluateAiHardGate({ ...validConfig, apiKey: "" });
      expect(result2.allowed).toBe(false);
      expect(result2.reasons).toContain("MISSING_API_KEY");

      const result3 = evaluateAiHardGate({ ...validConfig, apiKey: "   " });
      expect(result3.allowed).toBe(false);
      expect(result3.reasons).toContain("MISSING_API_KEY");
    });

    it("blocks when costAck is missing or invalid", () => {
      const result1 = evaluateAiHardGate({ ...validConfig, costAck: undefined });
      expect(result1.allowed).toBe(false);
      expect(result1.reasons).toContain("COST_NOT_ACKNOWLEDGED");

      const result2 = evaluateAiHardGate({ ...validConfig, costAck: "false" });
      expect(result2.allowed).toBe(false);
      expect(result2.reasons).toContain("COST_NOT_ACKNOWLEDGED");
    });

    it("collects multiple failure reasons when several conditions are not met", () => {
      const invalidConfig: AiHardGateInput = {
        aiProvider: "fake",
        liveAiEnabled: "false",
        apiKey: "",
        costAck: "false"
      };

      const result = evaluateAiHardGate(invalidConfig);

      expect(result.allowed).toBe(false);
      expect(result.reasons.length).toBe(4);
      expect(result.reasons).toContain("AI_PROVIDER_NOT_LIVE");
      expect(result.reasons).toContain("LIVE_AI_DISABLED");
      expect(result.reasons).toContain("MISSING_API_KEY");
      expect(result.reasons).toContain("COST_NOT_ACKNOWLEDGED");
    });
  });

  describe("liveAiIsBlocked", () => {
    it("returns false (not blocked) when all conditions are met", () => {
      const mockEnv = {
        AI_PROVIDER: "live",
        LIVE_AI_ENABLED: "true",
        AI_API_KEY: "secret-key",
        AI_COST_ACK: "true"
      };

      expect(liveAiIsBlocked(mockEnv)).toBe(false);
    });

    it("returns true (blocked) when any condition fails", () => {
      const mockEnv = {
        AI_PROVIDER: "live",
        LIVE_AI_ENABLED: "true",
        AI_API_KEY: "secret-key"
        // Missing AI_COST_ACK
      };

      expect(liveAiIsBlocked(mockEnv)).toBe(true);
    });
  });
});
