// AI hard gate (SPEC-007). A live AI provider is allowed ONLY when every condition holds; any missing
// condition falls back to the fake provider (fail-safe). Default-off — CI/demo never enable live AI.
// Pure and side-effect free so it can back both the provider selector and the `ai:check` gate.

export type AiHardGateInput = {
  aiProvider: string | undefined;
  liveAiEnabled: string | undefined;
  apiKey: string | undefined;
  costAck: string | undefined;
};

export type AiHardGateResult = {
  allowed: boolean;
  reasons: string[];
};

export function readAiHardGateInput(env: Record<string, string | undefined> = process.env): AiHardGateInput {
  return {
    aiProvider: env.AI_PROVIDER,
    liveAiEnabled: env.LIVE_AI_ENABLED,
    apiKey: env.AI_API_KEY,
    costAck: env.AI_COST_ACK
  };
}

export function evaluateAiHardGate(input: AiHardGateInput): AiHardGateResult {
  const reasons: string[] = [];

  if (input.aiProvider !== "live") {
    reasons.push("AI_PROVIDER_NOT_LIVE");
  }
  if (input.liveAiEnabled !== "true") {
    reasons.push("LIVE_AI_DISABLED");
  }
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    reasons.push("MISSING_API_KEY");
  }
  if (input.costAck !== "true") {
    reasons.push("COST_NOT_ACKNOWLEDGED");
  }

  return { allowed: reasons.length === 0, reasons };
}

export function liveAiIsBlocked(env: Record<string, string | undefined> = process.env): boolean {
  return !evaluateAiHardGate(readAiHardGateInput(env)).allowed;
}
