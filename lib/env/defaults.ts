export const envDefaults = Object.freeze({
  DEMO_MODE: "true",
  LIVE_MESSAGING_ENABLED: "false",
  LIVE_BILLING_ENABLED: "false",
  MESSAGING_PROVIDER: "dummy",
  AI_PROVIDER: "fake"
} as const);

export const localDatabaseUrl = "postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public";

export function applyDemoSafeRuntimeDefaults(env: Record<string, string | undefined> = process.env) {
  for (const [key, value] of Object.entries(envDefaults)) {
    env[key] ??= value;
  }
  env.DATABASE_URL ??= localDatabaseUrl;
}
