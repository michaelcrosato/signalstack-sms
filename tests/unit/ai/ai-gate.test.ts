import { describe, expect, it } from "vitest";
import { readAiHardGateInput } from "@/lib/ai/ai-gate";

describe("ai-gate", () => {
  describe("readAiHardGateInput", () => {
    it("extracts values from environment variables", () => {
      const env = {
        AI_PROVIDER: "live",
        LIVE_AI_ENABLED: "true",
        AI_API_KEY: "secret",
        AI_COST_ACK: "true"
      };

      const result = readAiHardGateInput(env);

      expect(result).toEqual({
        aiProvider: "live",
        liveAiEnabled: "true",
        apiKey: "secret",
        costAck: "true"
      });
    });

    it("handles missing environment variables gracefully", () => {
      const env = {};
      const result = readAiHardGateInput(env);

      expect(result).toEqual({
        aiProvider: undefined,
        liveAiEnabled: undefined,
        apiKey: undefined,
        costAck: undefined
      });
    });

    it("defaults to process.env if no argument is provided", () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        AI_PROVIDER: "test-provider"
      };

      try {
        const result = readAiHardGateInput();
        expect(result.aiProvider).toBe("test-provider");
      } finally {
        process.env = originalEnv;
      }
    });
  });
});
