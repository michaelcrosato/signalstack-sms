import { defineConfig, devices } from "@playwright/test";

function parsePlaywrightPort(value: string | undefined): number {
  if (!value) {
    return 3100;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

const e2ePort = parsePlaywrightPort(process.env.PLAYWRIGHT_PORT);
const baseURL = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
