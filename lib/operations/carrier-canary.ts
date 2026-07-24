export const MAX_CARRIER_CANARY_COST_USD = 1.00;
export const DEFAULT_SMS_SEGMENT_COST_USD = 0.0079;

export type CarrierCanaryEvaluationResult = Readonly<{
  allowed: boolean;
  mode: "demo-safe" | "authorized-live" | "blocked";
  costCapUsd: number;
  estimatedCostUsd: number;
  reason: string;
  warnings: readonly string[];
}>;

export type CarrierCanaryOptions = Readonly<{
  estimatedCostUsd?: number;
  messageCount?: number;
  targetNumber?: string;
}>;

export function evaluateCarrierCanaryPolicy(
  env: Record<string, string | undefined> = process.env,
  options: CarrierCanaryOptions = {}
): CarrierCanaryEvaluationResult {
  const isCi = env.CI === "true" || env.CONTINUOUS_INTEGRATION === "true" || env.GITHUB_ACTIONS === "true";
  const isAuthorized = env.CARRIER_CANARY_AUTHORIZED === "true";
  const messageCount = options.messageCount ?? 1;
  const estimatedCostUsd = options.estimatedCostUsd ?? messageCount * DEFAULT_SMS_SEGMENT_COST_USD;
  const warnings: string[] = [];

  // CI environments or non-authorized flags default safely to demo-safe mode
  if (isCi) {
    if (isAuthorized) {
      warnings.push("CARRIER_CANARY_AUTHORIZED=true ignored in CI environment.");
    }
    return Object.freeze({
      allowed: true,
      mode: "demo-safe",
      costCapUsd: MAX_CARRIER_CANARY_COST_USD,
      estimatedCostUsd: 0,
      reason: "CI environment detected. Live carrier sends strictly disabled; demo-safe mode enforced.",
      warnings: Object.freeze(warnings)
    });
  }

  if (!isAuthorized) {
    return Object.freeze({
      allowed: true,
      mode: "demo-safe",
      costCapUsd: MAX_CARRIER_CANARY_COST_USD,
      estimatedCostUsd: 0,
      reason: "CARRIER_CANARY_AUTHORIZED is false or unset. Demo-safe mode active (live sends disabled).",
      warnings: Object.freeze(warnings)
    });
  }

  // Explicit human authorization requested
  if (estimatedCostUsd > MAX_CARRIER_CANARY_COST_USD) {
    return Object.freeze({
      allowed: false,
      mode: "blocked",
      costCapUsd: MAX_CARRIER_CANARY_COST_USD,
      estimatedCostUsd,
      reason: `Canary execution blocked: estimated cost ($${estimatedCostUsd.toFixed(4)} USD) exceeds cost cap of $${MAX_CARRIER_CANARY_COST_USD.toFixed(2)} USD.`,
      warnings: Object.freeze(warnings)
    });
  }

  const liveMessagingEnabled = env.LIVE_MESSAGING_ENABLED === "true";
  const messagingProvider = env.MESSAGING_PROVIDER ?? "dummy";
  const twilioAccountConfigured = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  const senderConfigured = Boolean(env.TWILIO_FROM_NUMBER || env.TWILIO_MESSAGING_SERVICE_SID);

  if (!liveMessagingEnabled || messagingProvider !== "twilio" || !twilioAccountConfigured || !senderConfigured) {
    return Object.freeze({
      allowed: false,
      mode: "blocked",
      costCapUsd: MAX_CARRIER_CANARY_COST_USD,
      estimatedCostUsd,
      reason: "Canary authorization claimed but required live provider settings are incomplete (LIVE_MESSAGING_ENABLED=true, MESSAGING_PROVIDER=twilio, Twilio credentials required).",
      warnings: Object.freeze(warnings)
    });
  }

  return Object.freeze({
    allowed: true,
    mode: "authorized-live",
    costCapUsd: MAX_CARRIER_CANARY_COST_USD,
    estimatedCostUsd,
    reason: `Live carrier canary authorized within budget cap ($${estimatedCostUsd.toFixed(4)} USD <= $${MAX_CARRIER_CANARY_COST_USD.toFixed(2)} USD).`,
    warnings: Object.freeze(warnings)
  });
}
