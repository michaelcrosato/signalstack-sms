export type ProductionDeploymentGateResult = {
  productionLike: boolean;
  allowed: boolean;
  blockers: string[];
};

const productionValues = new Set(["production", "prod"]);

function envValueIsProductionLike(value: string | undefined) {
  return value ? productionValues.has(value.toLowerCase()) : false;
}

export function environmentIsProductionLike(env: Record<string, string | undefined>) {
  return (
    envValueIsProductionLike(env.NODE_ENV) ||
    envValueIsProductionLike(env.VERCEL_ENV) ||
    envValueIsProductionLike(env.DEPLOYMENT_ENV) ||
    envValueIsProductionLike(env.APP_ENV)
  );
}

export function evaluateProductionDeploymentGate(
  env: Record<string, string | undefined>
): ProductionDeploymentGateResult {
  const productionLike = environmentIsProductionLike(env);
  const blockers: string[] = [];
  const overrideEnabled = env.ALLOW_PRODUCTION_EXTERNALS === "true";

  if (productionLike && !overrideEnabled) {
    if (env.LIVE_MESSAGING_ENABLED === "true") {
      blockers.push("LIVE_MESSAGING_ENABLED_TRUE");
    }
    if (env.LIVE_BILLING_ENABLED === "true") {
      blockers.push("LIVE_BILLING_ENABLED_TRUE");
    }
    if (env.MESSAGING_PROVIDER && env.MESSAGING_PROVIDER !== "dummy") {
      blockers.push("LIVE_MESSAGING_PROVIDER_SELECTED");
    }
    if (env.AI_PROVIDER && env.AI_PROVIDER !== "fake") {
      blockers.push("LIVE_AI_PROVIDER_SELECTED");
    }
    if (env.TWILIO_ACCOUNT_SID || env.TWILIO_AUTH_TOKEN || env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER) {
      blockers.push("TWILIO_SECRET_OR_ACCOUNT_CONFIG_PRESENT");
    }
    if (env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET) {
      blockers.push("STRIPE_SECRET_CONFIG_PRESENT");
    }
  }

  return {
    productionLike,
    allowed: blockers.length === 0,
    blockers
  };
}
