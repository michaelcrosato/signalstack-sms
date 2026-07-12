import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) {
  console.error("npm_execpath is required to run tenant database tests.");
  process.exit(1);
}

const files = [
  "tests/unit/db/control-policy-hardening.test.ts",
  "tests/unit/db/least-privilege-owner.test.ts",
  "tests/unit/db/tenant-runtime-role.test.ts",
  "tests/unit/db/worker-runtime-dispatch.test.ts",
  "tests/unit/db/tenant-relation-integrity.test.ts",
  "tests/unit/db/public-integration-substrate.test.ts",
  "tests/unit/db/provider-ownership-substrate.test.ts",
  "tests/unit/db/provider-webhook-routing-exit-path.test.ts",
  "tests/unit/db/public-api-runtime.test.ts",
  "tests/unit/db/public-api-exit-path.test.ts",
  "tests/unit/db/rls-isolation.test.ts",
  "tests/unit/db/queue-cancel-claim-race.test.ts",
  "tests/unit/db/webhook-claim-lease.test.ts"
];
runVitest(files, { RUN_DB_TESTS: "true", RUN_NETWORK_DB_TESTS: "false" });
runVitest(
  ["tests/unit/db/public-api-network-exit-path.test.ts"],
  { RUN_DB_TESTS: "true", RUN_NETWORK_DB_TESTS: "true" }
);

function runVitest(testFiles: readonly string[], environment: Readonly<Record<string, string>>): void {
  const result = spawnSync(
    process.execPath,
    [npmCli!, "exec", "--", "vitest", "run", ...testFiles],
    {
      stdio: "inherit",
      env: { ...process.env, ...environment }
    }
  );
  if (result.error) {
    console.error("Tenant database test runner failed to start.");
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
