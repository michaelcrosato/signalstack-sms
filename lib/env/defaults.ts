export const envDefaults = {
  DEMO_MODE: "true",
  LIVE_MESSAGING_ENABLED: "false",
  LIVE_BILLING_ENABLED: "false",
  MESSAGING_PROVIDER: "dummy",
  AI_PROVIDER: "fake"
} as const;

export function assertDemoSafeDefaults(values: Record<string, string | undefined>) {
  for (const [key, expected] of Object.entries(envDefaults)) {
    if (values[key] !== expected) {
      throw new Error(`${key} must default to ${expected}`);
    }
  }
}
