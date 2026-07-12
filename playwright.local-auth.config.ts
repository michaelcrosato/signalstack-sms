import { defineConfig, devices } from "@playwright/test";

if (process.env.RUN_LOCAL_AUTH_E2E !== "true") {
  throw new Error("The dedicated local-auth Playwright config requires RUN_LOCAL_AUTH_E2E=true.");
}

const port = parsePort(process.env.PLAYWRIGHT_PORT);
const baseURL = `http://127.0.0.1:${port}`;
requireProductionServerMode(process.env.LOCAL_AUTH_E2E_SERVER_MODE);
const serverCommand = `npm run start -- --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: ["local-auth-path.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    extraHTTPHeaders: trustedLoopbackProxyHeaders(port),
    trace: "off",
    screenshot: "off",
    video: "off"
  },
  webServer: {
    command: serverCommand,
    url: baseURL,
    env: applicationServerEnvironment(process.env),
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3_201 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535.");
  }
  return port;
}

export function trustedLoopbackProxyHeaders(port: number) {
  return {
    "x-forwarded-for": "127.0.0.1",
    "x-forwarded-host": `127.0.0.1:${port}`,
    "x-forwarded-proto": "http"
  };
}

function requireProductionServerMode(value: string | undefined): void {
  if (value !== undefined && value !== "production") {
    throw new Error("LOCAL_AUTH_E2E_SERVER_MODE must be production when provided.");
  }
}

function applicationServerEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return {
    ...Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "MIGRATION_DATABASE_URL"
    )
    ),
    MIGRATION_DATABASE_URL: ""
  };
}
