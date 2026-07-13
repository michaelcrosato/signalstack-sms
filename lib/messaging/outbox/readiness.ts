import { environmentIsProductionLike } from "@/lib/deployment/production-gate";
import { parseProviderCredentialMasterKey } from "@/lib/integrations/provider-accounts/credential-encryption";

export const directMessageLiveWorkerDeploymentClass = "production-live-direct" as const;

export type DirectMessageWorkerReadinessInput = Readonly<{
  workerEnabled?: unknown;
  workerDeploymentClass?: unknown;
  runtimeProcess?: unknown;
  demoMode?: unknown;
  liveMessagingEnabled?: unknown;
  messagingProvider?: unknown;
  appUrl?: unknown;
  secretsMasterKey?: unknown;
  nodeEnv?: unknown;
  vercelEnv?: unknown;
  deploymentEnv?: unknown;
  appEnv?: unknown;
}>;

export type DirectMessageWorkerReadiness =
  | Readonly<{ allowed: true; transport: "dummy" | "twilio" }>
  | Readonly<{
      allowed: false;
      reason:
        | "worker-disabled"
        | "worker-process-invalid"
        | "demo-worker-invalid"
        | "live-worker-invalid";
    }>;

export function directMessageWorkerReadiness(
  input: DirectMessageWorkerReadinessInput
): DirectMessageWorkerReadiness {
  const provider = input.messagingProvider ?? "dummy";
  const liveEnabled = input.liveMessagingEnabled === true || input.liveMessagingEnabled === "true";
  const demoMode = input.demoMode === undefined || input.demoMode === true || input.demoMode === "true";
  const production = environmentIsProductionLike({
    NODE_ENV: stringValue(input.nodeEnv),
    VERCEL_ENV: stringValue(input.vercelEnv),
    DEPLOYMENT_ENV: stringValue(input.deploymentEnv),
    APP_ENV: stringValue(input.appEnv)
  });

  if (provider === "dummy") {
    if (
      production ||
      liveEnabled ||
      !demoMode ||
      (input.workerDeploymentClass !== undefined &&
        input.workerDeploymentClass !== "" &&
        input.workerDeploymentClass !== "local-demo")
    ) {
      return Object.freeze({ allowed: false, reason: "demo-worker-invalid" });
    }
    return Object.freeze({ allowed: true, transport: "dummy" });
  }

  if (input.workerEnabled !== true && input.workerEnabled !== "true") {
    return Object.freeze({ allowed: false, reason: "worker-disabled" });
  }
  if (input.runtimeProcess !== "worker" && input.runtimeProcess !== "all") {
    return Object.freeze({ allowed: false, reason: "worker-process-invalid" });
  }
  if (
    provider !== "twilio" ||
    !liveEnabled ||
    demoMode ||
    input.workerDeploymentClass !== directMessageLiveWorkerDeploymentClass ||
    typeof input.appUrl !== "string" ||
    !validHttpsOrigin(input.appUrl) ||
    !validMasterKey(input.secretsMasterKey)
  ) {
    return Object.freeze({ allowed: false, reason: "live-worker-invalid" });
  }
  return Object.freeze({ allowed: true, transport: "twilio" });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function validHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validMasterKey(value: unknown): boolean {
  if (typeof value !== "string" && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    return false;
  }
  try {
    parseProviderCredentialMasterKey(value);
    return true;
  } catch {
    return false;
  }
}
