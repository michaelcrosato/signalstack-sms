import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (process.env.RUN_LOCAL_AUTH_E2E !== "true") {
  throw new Error("Production local-auth E2E requires RUN_LOCAL_AUTH_E2E=true.");
}

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath || !existsSync(npmExecPath)) {
  throw new Error("npm_execpath is required to run the production local-auth E2E proof.");
}

const environment = {
  ...process.env,
  LOCAL_AUTH_E2E_SERVER_MODE: "production"
};
const applicationEnvironment = { ...environment, MIGRATION_DATABASE_URL: undefined };

runNpmScript("build", applicationEnvironment);
runNpmScript("test:e2e:local-auth", environment);

function runNpmScript(name: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, [npmExecPath!, "run", name], {
    env,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
