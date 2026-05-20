import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "contracts:check"]],
  ["npm", ["run", "secrets:scan"]],
  ["npm", ["run", "compliance:check"]],
  ["npm", ["run", "production:gate"]],
  ["npm", ["run", "observability:check"]],
  ["npm", ["run", "operator:check"]],
  ["npm", ["run", "platform:check"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npx", ["prisma", "validate"]],
  ["npm", ["run", "db:generate"]],
  ["npm", ["run", "test"]],
  ["npm", ["run", "test:e2e:smoke"]],
  ["npm", ["run", "build"]]
] as const;

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      DEMO_MODE: process.env.DEMO_MODE ?? "true",
      LIVE_MESSAGING_ENABLED: process.env.LIVE_MESSAGING_ENABLED ?? "false",
      LIVE_BILLING_ENABLED: process.env.LIVE_BILLING_ENABLED ?? "false",
      MESSAGING_PROVIDER: process.env.MESSAGING_PROVIDER ?? "dummy",
      AI_PROVIDER: process.env.AI_PROVIDER ?? "fake",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public"
    }
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
