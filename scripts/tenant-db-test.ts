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
  "tests/unit/db/rls-isolation.test.ts",
  "tests/unit/db/queue-cancel-claim-race.test.ts",
  "tests/unit/db/webhook-claim-lease.test.ts"
];
const result = spawnSync(
  process.execPath,
  [npmCli, "exec", "--", "vitest", "run", ...files],
  {
    stdio: "inherit",
    env: { ...process.env, RUN_DB_TESTS: "true" }
  }
);

if (result.error) {
  console.error("Tenant database test runner failed to start.");
  process.exit(1);
}
process.exit(result.status ?? 1);
