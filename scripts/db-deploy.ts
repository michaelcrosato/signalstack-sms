import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { localDatabaseUrl } from "@/lib/env/defaults";

const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) {
  console.error("npm_execpath is required to run Prisma migrations.");
  process.exit(1);
}

const configuredUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const production = ["production", "prod"].includes(process.env.APP_ENV?.trim().toLowerCase() ?? "");
if (!configuredUrl && production) {
  console.error("MIGRATION_DATABASE_URL (or DATABASE_URL for local development) is required.");
  process.exit(1);
}
const migrationUrl = configuredUrl ?? localDatabaseUrl;

const result = spawnSync(process.execPath, [npmCli, "exec", "--", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: migrationUrl }
});

if (result.error) {
  console.error("Prisma migration deployment failed to start.");
  process.exit(1);
}
process.exit(result.status ?? 1);
