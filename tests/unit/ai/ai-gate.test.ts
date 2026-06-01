import { describe, expect, it, vi, afterEach } from "vitest";
import {
  AiHardGateInput,
  evaluateAiHardGate,
  liveAiIsBlocked,
  readAiHardGateInput,
} from "@/lib/ai/ai-gate";

describe("ai-gate", () => {
  describe("readAiHardGateInput", () => {
    it("should map valid environment variables correctly", () => {
      const mockEnv = {
        AI_PROVIDER: "live",
        LIVE_AI_ENABLED: "true",
        AI_API_KEY: "secret-key",
        AI_COST_ACK: "true",
      };

      const input = readAiHardGateInput(mockEnv);

      expect(input).toEqual({
        aiProvider: "live",
        liveAiEnabled: "true",
        apiKey: "secret-key",
        costAck: "true",
      });
    });

    it("should handle missing environment variables", () => {
      const mockEnv = {};

      const input = readAiHardGateInput(mockEnv);

      expect(input).toEqual({
        aiProvider: undefined,
        liveAiEnabled: undefined,
        apiKey: undefined,
        costAck: undefined,
      });
    });
  });

  describe("evaluateAiHardGate", () => {
    it("should allow when all conditions are met", () => {
      const input: AiHardGateInput = {
        aiProvider: "live",
        liveAiEnabled: "true",
        apiKey: "secret-key",
        costAck: "true",
      };

      const result = evaluateAiHardGate(input);

      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("should reject when aiProvider is not live", () => {
      const input: AiHardGateInput = {
        aiProvider: "fake",
        liveAiEnabled: "true",
        apiKey: "secret-key",
        costAck: "true",
      };

      const result = evaluateAiHardGate(input);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("AI_PROVIDER_NOT_LIVE");
    });

    it("should reject when liveAiEnabled is not true", () => {
      const input: AiHardGateInput = {
        aiProvider: "live",
        liveAiEnabled: "false",
        apiKey: "secret-key",
        costAck: "true",
      };

      const result = evaluateAiHardGate(input);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("LIVE_AI_DISABLED");
    });

    it("should reject when apiKey is missing or empty", () => {
      const input1: AiHardGateInput = {
        aiProvider: "live",
        liveAiEnabled: "true",
        apiKey: undefined,
        costAck: "true",
      };
      const input2: AiHardGateInput = {
        ...input1,
        apiKey: "   ",
      };

      const result1 = evaluateAiHardGate(input1);
      const result2 = evaluateAiHardGate(input2);

      expect(result1.allowed).toBe(false);
      expect(result1.reasons).toContain("MISSING_API_KEY");
      expect(result2.allowed).toBe(false);
      expect(result2.reasons).toContain("MISSING_API_KEY");
    });

    it("should reject when costAck is not true", () => {
      const input: AiHardGateInput = {
        aiProvider: "live",
        liveAiEnabled: "true",
        apiKey: "secret-key",
        costAck: undefined,
      };

      const result = evaluateAiHardGate(input);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("COST_NOT_ACKNOWLEDGED");
    });

    it("should accumulate multiple reasons when multiple conditions fail", () => {
      const input: AiHardGateInput = {
        aiProvider: "fake",
        liveAiEnabled: undefined,
        apiKey: "   ",
        costAck: "false",
      };

      const result = evaluateAiHardGate(input);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("AI_PROVIDER_NOT_LIVE");
      expect(result.reasons).toContain("LIVE_AI_DISABLED");
      expect(result.reasons).toContain("MISSING_API_KEY");
      expect(result.reasons).toContain("COST_NOT_ACKNOWLEDGED");
      expect(result.reasons.length).toBe(4);
    });
  });

  describe("liveAiIsBlocked", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should return false (not blocked) when all environment variables are valid", () => {
      const mockEnv = {
        AI_PROVIDER: "live",
        LIVE_AI_ENABLED: "true",
        AI_API_KEY: "secret-key",
        AI_COST_ACK: "true",
      };

      const isBlocked = liveAiIsBlocked(mockEnv);

      expect(isBlocked).toBe(false);
    });

    it("should return true (blocked) when any environment variable is missing", () => {
      const mockEnv = {
        AI_PROVIDER: "live",
        LIVE_AI_ENABLED: "true",
        // Missing AI_API_KEY and AI_COST_ACK
      };

      const isBlocked = liveAiIsBlocked(mockEnv);

      expect(isBlocked).toBe(true);
    });

    it("should fallback to process.env if no argument is provided", () => {
      vi.stubEnv("AI_PROVIDER", "live");
      vi.stubEnv("LIVE_AI_ENABLED", "true");
      vi.stubEnv("AI_API_KEY", "secret-key");
      vi.stubEnv("AI_COST_ACK", "true");

      const isBlocked = liveAiIsBlocked();

      expect(isBlocked).toBe(false);
    });

    it("should fallback to process.env and block if process.env lacks requirements", () => {
      vi.stubEnv("AI_PROVIDER", "fake");

      const isBlocked = liveAiIsBlocked();

      expect(isBlocked).toBe(true);
    });
  });
});
