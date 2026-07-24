import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";

applyDemoSafeRuntimeDefaults();

const scripts = [
  "contracts:check",
  "openapi:check",
  "examples:check",
  "standalone:check",
  "tenant:boundary:check",
  "tenant:integrity:preflight",
  "docker:context:check",
  "runtime:check",
  "secrets:scan",
  "compliance:check",
  "production:gate",
  "production-auth:check",
  "production-worker:check",
  "observability:check",
  "operator:check",
  "platform:check",
  "context:check",
  "security:check",
  "ai:check",
  "carrier-canary:check",
  "operational-drills:check",
  "lint",
  "typecheck",
  "db:validate",
  "db:generate",
  "test",
  ...(process.env.RUN_DB_TESTS === "true" ? ["test:tenant-db"] : []),
  "test:e2e:smoke",
  "build"
];

function npmCliPath() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return npmExecPath;
  }

  throw new Error("npm_execpath is required to run validation scripts without shell execution.");
}

const npmCli = npmCliPath();

for (const script of scripts) {
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    stdio: "inherit",
    env: {
      ...process.env,
      DEMO_MODE: process.env.DEMO_MODE ?? "true",
      LIVE_MESSAGING_ENABLED: process.env.LIVE_MESSAGING_ENABLED ?? "false",
      LIVE_BILLING_ENABLED: process.env.LIVE_BILLING_ENABLED ?? "false",
      MESSAGING_PROVIDER: process.env.MESSAGING_PROVIDER ?? "dummy",
      AI_PROVIDER: process.env.AI_PROVIDER ?? "fake",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://signalstack:signalstack@127.0.0.1:5432/signalstack_sms?schema=public"
    }
  });

  if (result.error) {
    console.error(`Validation command failed to start: npm run ${script}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
